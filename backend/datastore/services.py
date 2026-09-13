"""Runs a Datastore (query/action/s3/json) and, for scheduled stores, caches
the result and pushes it to subscribed websocket clients.

This is the single place both the on-demand API view (datastore/views.py)
and the cron scheduler (datastore/scheduler.py) call into, so the two
refresh modes described in the spec -- on-demand and on-schedule -- share
one execution path.
"""
from __future__ import annotations

import json

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

from breadboard.templating import substitute_template_vars
from connections.backends import RestConnectionBackend, S3ConnectionBackend, get_backend

from catalog.actions import run_action
from . import activity
from .engine import execute_query
from .models import Datastore
from .renderers import render as render_content


def _render_response(ds: Datastore, response) -> object:
    """source_type=action: apply ds's own renderer if set, else the previous
    behavior of parsing the whole response body as JSON."""
    if ds.renderer_type and ds.renderer_type != Datastore.RENDERER_NONE:
        return render_content(ds.renderer_type, response.content, ds.renderer_config)
    try:
        return response.json()
    except ValueError:
        return response.text


def _render_raw(ds: Datastore, raw: bytes) -> list[dict]:
    """source_type=s3: apply ds's own renderer if set, else wrap the raw
    content as a single-column table so the result is always rows/columns."""
    if ds.renderer_type and ds.renderer_type != Datastore.RENDERER_NONE:
        return render_content(ds.renderer_type, raw, ds.renderer_config)
    text = raw.decode('utf-8', errors='replace') if isinstance(raw, (bytes, bytearray)) else raw
    return [{'content': text}]


def _fetch_s3(ds: Datastore, params: dict) -> list[dict]:
    backend = get_backend(ds.connection)
    assert isinstance(backend, S3ConnectionBackend)
    bucket = backend.cfg('bucket')
    if not bucket:
        raise ValueError('The S3 connection has no bucket configured.')
    key = substitute_template_vars(ds.object_key, params)
    if not key:
        raise ValueError('No object key configured.')
    obj = backend.client().get_object(Bucket=bucket, Key=key)
    return _render_raw(ds, obj['Body'].read())


def _fetch_json_body(ds: Datastore, params: dict) -> bytes | str:
    """source_type=json's Body (specs/json_datastore.md): a REST connection's
    Data URL when ``connection`` is set, else the literal ``body`` text --
    which covers both the "hard-coded" and "passed as a parameter" cases,
    the latter just being ``body`` set to a bare ${param}.
    """
    if not ds.connection_id:
        return substitute_template_vars(ds.body, params) or ''
    backend = get_backend(ds.connection)
    assert isinstance(backend, RestConnectionBackend)
    base = (substitute_template_vars(backend.base_url, params) or '').rstrip('/')
    data_url = substitute_template_vars(ds.data_url, params) if ds.data_url else ''
    url = f"{base}/{data_url.lstrip('/')}" if data_url else base
    resp = requests.get(url, **backend.request_kwargs())
    resp.raise_for_status()
    return resp.content


def _fetch_json(ds: Datastore, params: dict) -> list[dict]:
    raw = _fetch_json_body(ds, params)
    root_path = substitute_template_vars(ds.json_root_path, params) or '$'
    return render_content('json', raw, {'root_path': root_path})


def run_datastore(ds: Datastore, params: dict | None = None, row_limit: int | None = None):
    """``row_limit``, when given, overrides ``ds.row_limit`` for this call only
    -- used by the manager/editor "Preview" feature to cap results without
    touching the datastore's saved configuration.
    """
    merged_params = {**ds.default_params, **(params or {})}
    limit = ds.row_limit if row_limit is None else row_limit

    if ds.source_type == Datastore.SOURCE_QUERY:
        # ${name} is a literal text substitution (see breadboard.templating),
        # applied ahead of SQLAlchemy's own :name bound-parameter handling in
        # execute_query -- the two syntaxes can coexist in the same query.
        sql_text = substitute_template_vars(ds.sql_text(), merged_params)
        return execute_query(ds.connection, sql_text, merged_params, limit)

    if ds.source_type == Datastore.SOURCE_ACTION:
        response = run_action(ds.action, merged_params)
        response.raise_for_status()
        result = _render_response(ds, response)
    elif ds.source_type == Datastore.SOURCE_S3:
        result = _fetch_s3(ds, merged_params)
    elif ds.source_type == Datastore.SOURCE_JSON:
        result = _fetch_json(ds, merged_params)
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
        result = run_datastore(ds)
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
