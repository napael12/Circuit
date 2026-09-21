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

from breadboard.templating import substitute_template_vars
from connections.backends import HttpConnectionBackend, S3ConnectionBackend, get_backend

from . import activity, cache as result_cache
from .engine import execute_query
from .models import Datastore
from .renderers import render as render_content


def substitute_config(value, params: dict):
    """Recursively applies substitute_template_vars to every string in a
    renderer_config value (e.g. root_path, a columns[].path, delimiter) --
    renderer_config is documented (Datastore.default_params) as supporting
    ${param} throughout, but render_content() itself just consumes the
    config as-is, so every caller resolves it against the live params first.
    """
    if isinstance(value, str):
        return substitute_template_vars(value, params)
    if isinstance(value, dict):
        return {k: substitute_config(v, params) for k, v in value.items()}
    if isinstance(value, list):
        return [substitute_config(v, params) for v in value]
    return value


def _fetch_serialized_http(ds: Datastore, params: dict) -> bytes | str:
    url = substitute_template_vars(ds.data_url, params)
    if not url:
        raise ValueError('No URL configured.')
    if ds.connection_id:
        backend = get_backend(ds.connection)
        assert isinstance(backend, HttpConnectionBackend)
        kwargs = backend.request_kwargs()
    else:
        kwargs = {'headers': {}, 'params': {}, 'auth': None, 'timeout': 30}

    request_params = {k: substitute_template_vars(str(v), params) for k, v in (ds.request_params or {}).items()}
    query_params = {**kwargs['params'], **request_params}
    method = ds.request_method or Datastore.METHOD_GET
    data = substitute_template_vars(ds.request_body, params) if method == Datastore.METHOD_POST else None

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
    object_url = substitute_template_vars(ds.object_url, params)
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

    key = substitute_template_vars(ds.object_key, params)
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
    directory = substitute_template_vars(ds.file_path, params)
    if not directory:
        raise ValueError('No file path configured.')
    expression = substitute_template_vars(ds.file_expression, params) or ''

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


def _fetch_serialized(ds: Datastore, params: dict) -> list[dict]:
    override = substitute_template_vars(ds.body, params)
    if override:
        raw = override
    elif ds.access_type == Datastore.ACCESS_HTTP:
        raw = _fetch_serialized_http(ds, params)
    elif ds.access_type == Datastore.ACCESS_S3:
        raw = _fetch_serialized_s3(ds, params)
    elif ds.access_type == Datastore.ACCESS_FILE:
        raw = _fetch_serialized_file(ds, params)
    else:
        raise ValueError(f'Unknown access_type: {ds.access_type}')
    return render_content(ds.renderer_type, raw, substitute_config(ds.renderer_config, params))


def run_datastore(ds: Datastore, params: dict | None = None, row_limit: int | None = None, use_cache: bool = True):
    """``row_limit``, when given, overrides ``ds.row_limit`` for this call only
    -- used by the manager/editor "Preview" feature to cap results without
    touching the datastore's saved configuration.

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
    result = _run_uncached(ds, merged_params, row_limit)
    if cacheable:
        result_cache.put(ds.pk, merged_params, result, ds.cache_seconds)
    return result


def _run_uncached(ds: Datastore, merged_params: dict, row_limit: int | None):
    limit = ds.row_limit if row_limit is None else row_limit

    if ds.source_type == Datastore.SOURCE_QUERY:
        # ${name} is a literal text substitution (see breadboard.templating),
        # applied ahead of SQLAlchemy's own :name bound-parameter handling in
        # execute_query -- the two syntaxes can coexist in the same query.
        sql_text = substitute_template_vars(ds.sql_text(), merged_params)
        return execute_query(ds.connection, sql_text, merged_params, limit)

    if ds.source_type == Datastore.SOURCE_SERIALIZED:
        result = _fetch_serialized(ds, merged_params)
    else:
        raise ValueError(f'Unknown source_type: {ds.source_type}')

    if limit is not None and isinstance(result, list):
        result = result[:limit]
    return result


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
