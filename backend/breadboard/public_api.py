"""Public, API-key-authenticated surface for pulling data from / pushing
data into Datastores (specs/api_datastore.md) -- deliberately separate from
the session-authenticated Manager API (datastore.views.DatastoreViewSet) so
the external contract (auth scheme, response formats, error shapes) can
evolve independently of the internal one.
"""
from __future__ import annotations

import csv
import io

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apikeys.authentication import ApiKeyAuthentication
from apikeys.models import ApiKeyUsage
from breadboard.access import can_access
from datastore import activity
from datastore.models import Datastore
from datastore.renderers import render as render_content
from datastore.services import run_datastore, substitute_config


def _log(request, ds_id: str, mode: str, ok: bool, detail: str = '') -> None:
    api_key = request.auth
    if api_key is None:
        return
    ApiKeyUsage.objects.create(
        api_key=api_key,
        ip_address=request.META.get('REMOTE_ADDR'),
        mode=mode,
        datastore_id=ds_id,
        ok=ok,
        detail=detail[:255],
    )


def _get_datastore(pk: str) -> Datastore:
    try:
        return Datastore.objects.get(pk=pk)
    except Datastore.DoesNotExist:
        raise Http404


def _request_value(request, key: str):
    """A single named value, from a query-string param first, else the
    (JSON or form) body -- used for the "format"/"filename" pull options so
    either calling convention works."""
    value = request.query_params.get(key)
    if value is not None:
        return value
    data = request.data
    return data.get(key) if isinstance(data, dict) else None


def _merged_params(request) -> dict:
    """Datastore ${param}/:param values (specs/api_datastore.md), collected
    from -- in increasing precedence -- the query string
    (?param1=value1&param2=value2), flat top-level body keys (a plain
    x-www-form-urlencoded POST, or a JSON body with no "params" wrapper),
    and a nested {"params": {...}} object (the original documented shape).
    Lets a pull be triggered as simply as a GET with a query string, a POST
    with form fields, or the original structured JSON body -- any mix of
    the three is merged rather than one replacing the others.
    """
    merged: dict = {key: request.query_params.get(key) for key in request.query_params}
    data = request.data
    if isinstance(data, dict):
        reserved = {'params', 'format', 'filename'}
        for key, value in data.items():
            if key not in reserved:
                merged[key] = value
        nested = data.get('params')
        if isinstance(nested, dict):
            merged.update(nested)
    return merged


def _rows_to_csv(rows: list[dict]) -> str:
    if not rows:
        return ''
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def _rows_to_xlsx(rows: list[dict]) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    if rows:
        fieldnames = list(rows[0].keys())
        ws.append(fieldnames)
        for row in rows:
            ws.append([row.get(f) for f in fieldnames])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class PullDatastoreView(APIView):
    """GET or POST /api/v1/datastores/<id>/pull/ -- specs/api_datastore.md I.

    Datastore params can be passed as a query string (?param1=value1&
    param2=value2 -- works with either method), as flat POST body fields,
    or in a POST body's {"params": {...}} object -- see _merged_params.
    "format" ("json"|"csv"|"xlsx") and "filename" accept the same either
    query-string-or-body convention (see _request_value). Returns JSON by
    default; csv/xlsx require the result to be tabular (a list of row
    objects) and stream back as a downloadable attachment.
    """

    authentication_classes = [ApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return self._pull(request, pk)

    def post(self, request, pk):
        return self._pull(request, pk)

    def _pull(self, request, pk):
        ds = _get_datastore(pk)
        if not can_access(request.user, ds):
            _log(request, pk, ApiKeyUsage.MODE_PULL, False, 'access denied')
            return Response({'detail': "You don't have access to this datastore."}, status=403)
        if ds.api_mode != Datastore.API_MODE_PULL:
            _log(request, pk, ApiKeyUsage.MODE_PULL, False, 'pull not enabled')
            return Response({'detail': 'This datastore is not enabled for API pull.'}, status=403)

        fmt = (_request_value(request, 'format') or 'json').lower()
        try:
            result = run_datastore(ds, _merged_params(request))
        except Exception as exc:  # noqa: BLE001 - surface any driver/query/HTTP error to the caller
            _log(request, pk, ApiKeyUsage.MODE_PULL, False, str(exc)[:255])
            return Response({'detail': str(exc)}, status=400)

        if fmt == 'json':
            _log(request, pk, ApiKeyUsage.MODE_PULL, True)
            return Response(result)

        if fmt not in ('csv', 'xlsx'):
            _log(request, pk, ApiKeyUsage.MODE_PULL, False, f'unknown format "{fmt}"')
            return Response({'detail': f'Unknown format "{fmt}". Use json, csv, or xlsx.'}, status=400)

        if not isinstance(result, list) or (result and not isinstance(result[0], dict)):
            _log(request, pk, ApiKeyUsage.MODE_PULL, False, f'{fmt} requested for non-tabular data')
            return Response({'detail': f'"{fmt}" export requires tabular (row/column) data.'}, status=400)

        filename = (_request_value(request, 'filename') or ds.id).strip() or ds.id
        _log(request, pk, ApiKeyUsage.MODE_PULL, True)
        if fmt == 'csv':
            response = HttpResponse(_rows_to_csv(result), content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="{filename}.csv"'
            return response
        response = HttpResponse(
            _rows_to_xlsx(result),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}.xlsx"'
        return response


class PushDatastoreView(APIView):
    """POST /api/v1/datastores/<id>/push/ -- specs/api_datastore.md II.

    Body: the JSON payload to push (a bare object or array -- whatever the
    configured root path expects), run through the JSON renderer, then
    cached and broadcast to every panel/control currently subscribed to
    this datastore's websocket group -- refresh_mode is ignored entirely;
    row_limit still applies. If nothing is currently listening, the payload
    is not processed.

    Only reachable when renderer_type is JSON (DatastoreSerializer.validate
    enforces this at save time), so an XML/Delimited-configured datastore
    can never have api_mode=push in the first place.

    The renderer_config is resolved against default_params, overridden by
    any query-string params on the call itself (?param1=value1&param2=
    value2) -- the request body is the payload, so unlike Pull there's no
    room for params inside it.
    """

    authentication_classes = [ApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        ds = _get_datastore(pk)
        if not can_access(request.user, ds):
            _log(request, pk, ApiKeyUsage.MODE_PUSH, False, 'access denied')
            return Response({'detail': "You don't have access to this datastore."}, status=403)
        if ds.api_mode != Datastore.API_MODE_PUSH or ds.source_type != Datastore.SOURCE_SERIALIZED:
            _log(request, pk, ApiKeyUsage.MODE_PUSH, False, 'push not enabled')
            return Response({'detail': 'This datastore is not enabled for API push.'}, status=403)

        if not activity.has_active_connections(ds.id):
            _log(request, pk, ApiKeyUsage.MODE_PUSH, True, 'no active controls, skipped')
            return Response({'detail': 'No active controls -- push skipped.'}, status=202)

        params = {**ds.default_params, **{key: request.query_params.get(key) for key in request.query_params}}
        config = substitute_config(ds.renderer_config, params)
        try:
            result = render_content('json', request.data, config)
        except Exception as exc:  # noqa: BLE001 - surface a bad root_path/payload shape to the caller
            _log(request, pk, ApiKeyUsage.MODE_PUSH, False, str(exc)[:255])
            return Response({'detail': str(exc)}, status=400)

        if ds.row_limit is not None and isinstance(result, list):
            result = result[: ds.row_limit]

        ds.last_result = result
        ds.last_run_at = timezone.now()
        ds.last_error = ''
        ds.save(update_fields=['last_result', 'last_run_at', 'last_error'])

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'datastore_{ds.id}',
            {'type': 'datastore.update', 'data': result, 'last_run_at': ds.last_run_at.isoformat()},
        )
        _log(request, pk, ApiKeyUsage.MODE_PUSH, True)
        return Response({'detail': 'ok', 'rows': len(result) if isinstance(result, list) else None})
