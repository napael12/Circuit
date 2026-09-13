from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.access import visible_queryset
from breadboard.permissions import DatastoreRoleAccess, IsAdminOrReadOnly
from breadboard.slugs import unique_slug_id

from .models import Datastore
from .serializers import DatastoreSerializer
from .services import run_datastore

DEFAULT_PREVIEW_LIMIT = 10


def _preview_limit(data) -> int:
    try:
        return int(data.get('limit') or DEFAULT_PREVIEW_LIMIT)
    except (TypeError, ValueError):
        return DEFAULT_PREVIEW_LIMIT


def _run_preview(ds: Datastore, data) -> Response:
    try:
        result = run_datastore(ds, data.get('params'), row_limit=_preview_limit(data))
        return Response({'ok': True, 'data': result})
    except Exception as exc:  # noqa: BLE001 - surface any driver/query/HTTP error to the UI
        return Response({'ok': False, 'message': str(exc)})


class DatastoreViewSet(ModelViewSet):
    queryset = Datastore.objects.all()
    serializer_class = DatastoreSerializer
    permission_classes = [IsAdminOrReadOnly, DatastoreRoleAccess]

    def get_queryset(self):
        qs = super().get_queryset()
        # See PanelViewSet.get_queryset: list is filtered (specs/permissions.md
        # #5), detail lookups stay unfiltered so a restricted-but-existing
        # datastore 403s via DatastoreRoleAccess rather than 404ing (#6).
        return visible_queryset(qs, self.request.user) if self.action == 'list' else qs

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, DatastoreRoleAccess])
    def data(self, request, pk=None):
        """Fetch data for a panel control.

        For refresh_mode=on_demand this runs the query/action synchronously
        with the caller's params. For refresh_mode=scheduled it just returns
        the cached last_result -- the client should also open a
        /ws/datastore/{id}/ websocket to receive live pushes when the
        scheduler refreshes it (see datastore.consumers).
        """
        ds = self.get_object()
        if ds.refresh_mode == Datastore.REFRESH_SCHEDULED:
            return Response({'data': ds.last_result, 'last_run_at': ds.last_run_at})
        result = run_datastore(ds, request.data)
        return Response({'data': result})

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Manager UI "Preview": an ad-hoc, always-fresh test run of a saved
        datastore -- ignores refresh_mode/cache, takes caller-supplied
        params (layered over default_params) and a row limit (default 10).
        Admin-only via the viewset's default permission (POST isn't a safe
        method under IsAdminOrReadOnly).
        """
        return _run_preview(self.get_object(), request.data)

    @action(detail=False, methods=['post'], url_path='preview-config')
    def preview_config(self, request):
        """Same as preview/, but for an in-progress, possibly-unsaved
        datastore definition -- used by the manager's "New Datastore"
        dialog and the editor's local-datastore panel before either has
        been saved.
        """
        data = request.data
        ds = Datastore(
            source_type=data.get('source_type') or Datastore.SOURCE_QUERY,
            connection_id=data.get('connection') or None,
            sql_def_id=data.get('sql_def') or None,
            inline_sql=data.get('inline_sql') or '',
            row_limit=data.get('row_limit') or None,
            action_id=data.get('action') or None,
            object_key=data.get('object_key') or '',
            body=data.get('body') or '',
            data_url=data.get('data_url') or '',
            json_root_path=data.get('json_root_path') or '',
            renderer_type=data.get('renderer_type') or Datastore.RENDERER_NONE,
            renderer_config=data.get('renderer_config') or {},
            default_params=data.get('default_params') or {},
        )
        return _run_preview(ds, data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Clones this datastore under a new id (derived from the given name,
        or "{name}-copy" if none given). Does not carry over last_result/
        last_run_at/last_error -- a fresh clone hasn't run yet.
        """
        original = self.get_object()
        name = (request.data.get('name') or f'{original.name or original.id}-copy').strip()
        clone = Datastore.objects.create(
            id=unique_slug_id(Datastore, name),
            name=name,
            source_type=original.source_type,
            connection=original.connection,
            sql_def=original.sql_def,
            inline_sql=original.inline_sql,
            row_limit=original.row_limit,
            action=original.action,
            object_key=original.object_key,
            body=original.body,
            data_url=original.data_url,
            json_root_path=original.json_root_path,
            renderer_type=original.renderer_type,
            renderer_config=original.renderer_config,
            default_params=original.default_params,
            refresh_mode=original.refresh_mode,
            cron_schedule=original.cron_schedule,
        )
        return Response(DatastoreSerializer(clone).data, status=201)

    @action(detail=True)
    def params(self, request, pk=None):
        """${param} names discovered across this datastore's own metadata."""
        return Response(self.get_object().discover_param_names())

    @action(detail=False, methods=['post'], url_path='import')
    def import_json(self, request):
        """Imports one (or more) datastores from JSON previously produced by
        a datastore row's own Export action in the manager UI. Upserts by
        id. The manager only ever posts a single-item list here (per-item
        import, not a bulk restore -- see specs/datasource_enhancements.md),
        but the endpoint itself doesn't care how many rows are in the payload.
        """
        payload = request.data if isinstance(request.data, list) else request.data.get('datastores', [])
        created, updated, errors = [], [], []
        for row in payload:
            ds_id = row.get('id')
            if not ds_id:
                errors.append({'error': 'missing id', 'row': row})
                continue
            instance = Datastore.objects.filter(pk=ds_id).first()
            serializer = DatastoreSerializer(instance, data=row, partial=True)
            if serializer.is_valid():
                serializer.save()
                (updated if instance else created).append(ds_id)
            else:
                errors.append({'id': ds_id, 'errors': serializer.errors})
        return Response({'created': created, 'updated': updated, 'errors': errors})
