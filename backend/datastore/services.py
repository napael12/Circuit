"""Runs a Datastore (query/serialized) and, for scheduled stores, caches
the result and pushes it to subscribed websocket clients.

This is the single place both the on-demand API view (datastore/views.py)
and the cron scheduler (datastore/scheduler.py) call into, so the two
refresh modes described in the spec -- on-demand and on-schedule -- share
one execution path.
"""
from __future__ import annotations

import json
import os
import re

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from breadboard.templating import substitute_vars
from connections.backends import HttpConnectionBackend, S3ConnectionBackend, get_backend

from . import activity, cache as result_cache
from .engine import execute_query
from .models import Datastore
from .renderers import render as render_content


def substitute_config(value, params: dict):
    """Recursively applies substitute_vars to every string in a
    renderer_config value (e.g. root_path, a columns[].path, delimiter) --
    renderer_config is documented (Datastore.default_params) as supporting
    ${param} throughout, but render_content() itself just consumes the
    config as-is, so every caller resolves it against the live params (then
    Settings, dotted names included -- see substitute_vars) first.
    """
    if isinstance(value, str):
        return substitute_vars(value, params)
    if isinstance(value, dict):
        return {k: substitute_config(v, params) for k, v in value.items()}
    if isinstance(value, list):
        return [substitute_config(v, params) for v in value]
    return value


def _fetch_serialized_http(ds: Datastore, params: dict) -> bytes | str:
    url = substitute_vars(ds.data_url, params)
    if not url:
        raise ValueError('No URL configured.')
    if ds.connection_id:
        backend = get_backend(ds.connection)
        assert isinstance(backend, HttpConnectionBackend)
        kwargs = backend.request_kwargs()
    else:
        kwargs = {'headers': {}, 'params': {}, 'auth': None, 'timeout': 30}

    request_params = {k: substitute_vars(str(v), params) for k, v in (ds.request_params or {}).items()}
    query_params = {**kwargs['params'], **request_params}
    method = ds.request_method or Datastore.METHOD_GET
    data = substitute_vars(ds.request_body, params) if method == Datastore.METHOD_POST else None

    resp = requests.request(
        method, url, params=query_params or None, data=data,
        headers=kwargs['headers'], auth=kwargs['auth'], timeout=kwargs['timeout'],
    )
    resp.raise_for_status()
    return resp.content


_S3_VIRTUAL_HOSTED_RE = re.compile(r'^([^./]+)\.s3[.-](?:([a-z0-9-]+)\.)?amazonaws\.com$')
_S3_PATH_STYLE_RE = re.compile(r'^s3[.-](?:([a-z0-9-]+)\.)?amazonaws\.com$')


def _parse_s3_url(url: str) -> tuple[str, str] | None:
    """Pulls (bucket, key) out of an s3:// URI or an s3/virtual-hosted-style
    https URL (what S3's own console labels "S3 URI" / "Object URL") --
    returns None for anything else (e.g. a plain public HTTP URL), which the
    caller falls back to fetching unauthenticated.
    """
    from urllib.parse import unquote, urlparse

    parsed = urlparse(url)
    if parsed.scheme == 's3':
        return parsed.netloc, unquote(parsed.path).lstrip('/')
    if parsed.scheme not in ('http', 'https'):
        return None
    path = unquote(parsed.path).lstrip('/')
    match = _S3_VIRTUAL_HOSTED_RE.match(parsed.netloc)
    if match:
        return match.group(1), path
    if _S3_PATH_STYLE_RE.match(parsed.netloc) and '/' in path:
        bucket, key = path.split('/', 1)
        return bucket, key
    return None


def _fetch_serialized_s3(ds: Datastore, params: dict) -> bytes | str:
    object_url = substitute_vars(ds.object_url, params)
    if object_url:
        parsed = _parse_s3_url(object_url)
        if parsed and ds.connection_id:
            bucket, key = parsed
            backend = get_backend(ds.connection)
            assert isinstance(backend, S3ConnectionBackend)
            obj = backend.client().get_object(Bucket=bucket, Key=key)
            return obj['Body'].read()
        # No connection (or an unrecognized URL shape): fetch unauthenticated
        # -- the "public bucket URL" case.
        resp = requests.get(object_url, timeout=30)
        resp.raise_for_status()
        return resp.content

    if not ds.connection_id:
        raise ValueError('No S3 connection or object URL configured.')
    backend = get_backend(ds.connection)
    assert isinstance(backend, S3ConnectionBackend)

    key = substitute_vars(ds.object_key, params)
    parsed_key = _parse_s3_url(key) if key else None
    if parsed_key:
        bucket, key = parsed_key
        obj = backend.client().get_object(Bucket=bucket, Key=key)
        return obj['Body'].read()

    if not key:
        raise ValueError('No object key configured.')
    bucket = backend.cfg('bucket')
    if not bucket:
        raise ValueError('The S3 connection has no bucket configured.')
    obj = backend.client().get_object(Bucket=bucket, Key=key)
    return obj['Body'].read()


def _fetch_serialized_file(ds: Datastore, params: dict) -> bytes | str:
    directory = substitute_vars(ds.file_path, params)
    if not directory:
        raise ValueError('No file path configured.')
    expression = substitute_vars(ds.file_expression, params) or ''

    exact = os.path.join(directory, expression) if expression else None
    if exact and os.path.isfile(exact):
        target = exact
    else:
        if not expression:
            raise ValueError('No filename or regex configured.')
        pattern = re.compile(expression)
        candidates = sorted(
            name for name in os.listdir(directory)
            if pattern.search(name) and os.path.isfile(os.path.join(directory, name))
        )
        if not candidates:
            raise ValueError(f'No file matching "{expression}" found in "{directory}".')
        target = os.path.join(directory, candidates[0])

    with open(target, 'rb') as f:
        return f.read()


def datastore_from_dict(d: dict) -> Datastore:
    """A throwaway (unsaved) Datastore built from a plain dict of the same
    field names the model itself uses -- the shape a panel's own scope=local
    content.datastores entry (PanelDatastoreRef) and a client-posted
    in-progress definition (DatastoreViewSet.preview_config's request body)
    already share. Used wherever a definition needs to be run without (yet)
    existing as a real row: panels.views.PanelViewSet.local_datastore (a
    saved panel's own local datastores, and any local sibling one of them
    chains to via access_type=datastore) and DatastoreViewSet.preview_config
    (an in-progress, possibly-unsaved definition, and any sibling local
    datastore passed alongside it for the same reason -- see its own
    local_datastores request field).
    """
    return Datastore(
        source_type=d.get('source_type') or Datastore.SOURCE_QUERY,
        access_type=d.get('access_type') or '',
        connection_id=d.get('connection') or None,
        sql_def_id=d.get('sql_def') or None,
        inline_sql=d.get('inline_sql') or '',
        row_limit=d.get('row_limit') or None,
        object_key=d.get('object_key') or '',
        object_url=d.get('object_url') or '',
        body=d.get('body') or '',
        data_url=d.get('data_url') or '',
        request_method=d.get('request_method') or Datastore.METHOD_GET,
        request_params=d.get('request_params') or {},
        request_body=d.get('request_body') or '',
        file_path=d.get('file_path') or '',
        file_expression=d.get('file_expression') or '',
        source_datastore=d.get('source_datastore') or '',
        renderer_type=d.get('renderer_type') or Datastore.RENDERER_NONE,
        renderer_config=d.get('renderer_config') or {},
        default_params=d.get('default_params') or {},
    )


def get_datastore_raw_output(ds: Datastore, params: dict, local_datastores: dict[str, Datastore] | None = None) -> str:
    """The *entire* output of `ds`, serialized into one string -- used as
    another datastore's raw input when its own access_type=datastore (see
    _fetch_serialized_raw below). source_type=query -> its rows, JSON-encoded
    (matching pandas' own ``to_json(orient='records')``); source_type=
    serialized -> its own raw fetched content, exactly as retrieved (its own
    native json/xml/delimited text) -- recursing through _fetch_serialized_raw
    so a chain of access_type=datastore sources resolves end to end.
    `local_datastores` is threaded through unchanged, for that recursion.
    """
    merged_params = {**ds.default_params, **(params or {})}
    if ds.source_type == Datastore.SOURCE_QUERY:
        sql_text = substitute_vars(ds.sql_text(), merged_params)
        rows = execute_query(ds.connection, sql_text, merged_params, ds.row_limit)
        return json.dumps(rows, cls=DjangoJSONEncoder)
    if ds.source_type == Datastore.SOURCE_SERIALIZED:
        return _fetch_serialized_raw(ds, merged_params, local_datastores)
    raise ValueError(f'Unknown source_type: {ds.source_type}')


def _resolve_source_datastore(ds: Datastore, params: dict, local_datastores: dict[str, Datastore] | None) -> Datastore:
    """access_type=datastore: resolves Datastore.source_datastore by name --
    `local_datastores` (built by panels.views.local_datastore from a panel's
    own saved local defs, keyed by name) is checked first, so a panel-
    embedded datastore can reference a local sibling; everything else (every
    other caller passes no local_datastores at all) falls back to the shared
    Datastore table, which is the only thing a saved/global datastore can
    ever mean here -- it has no panel to resolve a "local" name against.
    """
    name = substitute_vars(ds.source_datastore, params)
    if not name:
        raise ValueError('No source datastore configured.')
    local = (local_datastores or {}).get(name)
    if local is not None:
        return local
    try:
        return Datastore.objects.get(pk=name)
    except Datastore.DoesNotExist:
        raise ValueError(f'Source datastore "{name}" not found.')


def _fetch_serialized_raw(ds: Datastore, params: dict, local_datastores: dict[str, Datastore] | None = None) -> str:
    """The raw content for a source_type=serialized datastore, decoded to
    text if bytes -- its own native json/xml/delimited document, before
    Renderer parses it into rows.

    access_type=embedded returns the datastore's own stored `body` directly
    (no fetch of any kind -- this IS the content, not an override of one).
    Every other access_type can still have its real fetch short-circuited by
    a non-blank `body` for ad hoc testing/troubleshooting
    (specs/serialized-datastore.md).
    """
    if ds.access_type == Datastore.ACCESS_EMBEDDED:
        return substitute_vars(ds.body, params) or ''

    override = substitute_vars(ds.body, params)
    if override:
        raw = override
    elif ds.access_type == Datastore.ACCESS_HTTP:
        raw = _fetch_serialized_http(ds, params)
    elif ds.access_type == Datastore.ACCESS_S3:
        raw = _fetch_serialized_s3(ds, params)
    elif ds.access_type == Datastore.ACCESS_FILE:
        raw = _fetch_serialized_file(ds, params)
    elif ds.access_type == Datastore.ACCESS_DATASTORE:
        source = _resolve_source_datastore(ds, params, local_datastores)
        raw = get_datastore_raw_output(source, params, local_datastores)
    else:
        raise ValueError(f'Unknown access_type: {ds.access_type}')
    return raw.decode('utf-8') if isinstance(raw, (bytes, bytearray)) else raw


def run_datastore(
    ds: Datastore,
    params: dict | None = None,
    row_limit: int | None = None,
    use_cache: bool = True,
    local_datastores: dict[str, Datastore] | None = None,
) -> list[dict]:
    """``row_limit``, when given, overrides ``ds.row_limit`` for this call only
    -- used by the manager/editor "Preview" feature to cap results without
    touching the datastore's saved configuration.

    ``local_datastores`` (name -> Datastore) is only ever passed by
    panels.views.local_datastore, for access_type=datastore sources that
    name a sibling local (panel-embedded) datastore instead of a saved one
    -- see _resolve_source_datastore. Datastores built this way are never
    cacheable (no ``ds.pk``), so it has no cache-key implications.

    When ``ds.cache_seconds`` is set, results are cached under datastore id +
    every input parameter (see datastore.cache). Previews (``row_limit``
    given) and the scheduler (``use_cache=False``) always run fresh.
    """
    merged_params = {**ds.default_params, **(params or {})}
    cacheable = use_cache and row_limit is None and bool(ds.cache_seconds) and bool(ds.pk)
    if cacheable:
        cached = result_cache.get(ds.pk, merged_params)
        if not result_cache.is_miss(cached):
            return cached
    result = _run_uncached(ds, merged_params, row_limit, local_datastores)
    if cacheable:
        result_cache.put(ds.pk, merged_params, result, ds.cache_seconds)
    return result


def _run_uncached(
    ds: Datastore, merged_params: dict, row_limit: int | None, local_datastores: dict[str, Datastore] | None = None,
) -> list[dict]:
    limit = ds.row_limit if row_limit is None else row_limit

    if ds.source_type == Datastore.SOURCE_QUERY:
        # ${name} is a literal text substitution (see breadboard.templating),
        # applied ahead of SQLAlchemy's own :name bound-parameter handling in
        # execute_query -- the two syntaxes can coexist in the same query.
        sql_text = substitute_vars(ds.sql_text(), merged_params)
        return execute_query(ds.connection, sql_text, merged_params, limit)

    if ds.source_type == Datastore.SOURCE_SERIALIZED:
        raw = _fetch_serialized_raw(ds, merged_params, local_datastores)
        result = render_content(ds.renderer_type, raw, substitute_config(ds.renderer_config, merged_params))
        if limit is not None and isinstance(result, list):
            result = result[:limit]
        return result

    raise ValueError(f'Unknown source_type: {ds.source_type}')


def refresh_scheduled(ds_id: str) -> None:
    """Run a scheduled Datastore, cache the result, and push it over websockets.

    Called by APScheduler on ds.cron_schedule (see datastore.scheduler), and
    once directly by DatastoreConsumer.connect when a dashboard/control
    reopens an idle datastore's websocket, so the viewer doesn't wait for the
    next cron tick.

    Skips the run entirely once idle (see datastore.activity /
    idle_timeout_seconds) -- no dashboard has this datastore's websocket
    open, and none has for longer than its configured timeout -- rather than
    keep querying/calling out for nobody.
    """
    ds = Datastore.objects.get(pk=ds_id)
    if activity.is_idle(ds.id, ds.idle_timeout_seconds):
        return
    try:
        result = run_datastore(ds, use_cache=False)
    except Exception as exc:  # noqa: BLE001 - surface any failure on the record
        ds.last_error = str(exc)
        ds.save(update_fields=['last_error'])
        return

    # A SQL row (datastore.engine.execute_query) can carry raw datetime/date/
    # Decimal cells -- fine for the on-demand path, whose DRF Response
    # renders those natively, but this scheduled path instead caches into a
    # plain JSONField and pushes over a raw websocket (both a bare
    # json.dumps in datastore.consumers), neither of which knows how to
    # serialize them. Round-tripping through DjangoJSONEncoder here once
    # normalizes those into the same ISO-string form DRF would've produced,
    # for both the cache and the live push below.
    result = json.loads(json.dumps(result, cls=DjangoJSONEncoder))

    ds.last_result = result
    ds.last_run_at = timezone.now()
    ds.last_error = ''
    ds.save(update_fields=['last_result', 'last_run_at', 'last_error'])

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'datastore_{ds.id}',
        {'type': 'datastore.update', 'data': result, 'last_run_at': ds.last_run_at.isoformat()},
    )
