from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.access import visible_queryset
from breadboard.permissions import ConnectionRoleAccess, IsAdminOrReadOnly
from breadboard.slugs import unique_slug_id

from .backends import test_connection
from .models import DataConnection
from .serializers import SECRET_CONFIG_KEYS, DataConnectionSerializer


class DataConnectionViewSet(ModelViewSet):
    queryset = DataConnection.objects.all()
    serializer_class = DataConnectionSerializer
    permission_classes = [IsAdminOrReadOnly, ConnectionRoleAccess]

    def get_queryset(self):
        qs = super().get_queryset()
        # See PanelViewSet.get_queryset: list is filtered (specs/permissions.md
        # #5), detail lookups stay unfiltered so a restricted-but-existing
        # connection 403s via ConnectionRoleAccess rather than 404ing (#6).
        return visible_queryset(qs, self.request.user) if self.action == 'list' else qs

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Tests a saved connection's current (persisted) credentials."""
        return Response(test_connection(self.get_object()))

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Clones this connection under a new id (there's no separate "name"
        field here -- id doubles as the display name in the manager table).
        Copies the real, unredacted password/config secrets straight off the
        DB instance -- DataConnectionSerializer would otherwise blank them.
        """
        original = self.get_object()
        name = (request.data.get('name') or f'{original.id}-copy').strip()
        clone = DataConnection.objects.create(
            id=unique_slug_id(DataConnection, name),
            description=original.description,
            type=original.type,
            dialect=original.dialect,
            host=original.host,
            port=original.port,
            database=original.database,
            options=original.options,
            url=original.url,
            username=original.username,
            password=original.password,
            config=original.config,
            max_rows=original.max_rows,
            timeout_seconds=original.timeout_seconds,
        )
        return Response(DataConnectionSerializer(clone).data, status=201)

    @action(detail=False, methods=['post'], url_path='test-config')
    def test_config(self, request):
        """Tests connection details from an in-progress, not-yet-saved form.

        Deliberately skips serializer validation (which would reject an
        existing id as a uniqueness violation while editing) -- this never
        persists anything, it just builds enough of a DataConnection in
        memory to attempt a connection.

        The manager's edit dialog never gets the saved secrets back (they're
        write_only -- see the serializer), so it always submits blank
        password/secret_key/token fields unless the user retypes them. A
        blank secret here means "use the saved one", same as a real save --
        mirrors DataConnectionSerializer.update()'s merge behaviour --
        otherwise testing an existing sql/s3/rest connection from the dialog
        would spuriously fail on every field the user didn't retype.
        """
        data = request.data
        existing = DataConnection.objects.filter(pk=data.get('id')).first() if data.get('id') else None

        password = data.get('password') or ''
        if not password and existing:
            password = existing.password

        config = dict(data.get('config') or {})
        if existing:
            for key in SECRET_CONFIG_KEYS:
                if not config.get(key):
                    config[key] = (existing.config or {}).get(key, '')

        conn = DataConnection(
            id=data.get('id') or 'test',
            type=data.get('type') or DataConnection.TYPE_SQL,
            dialect=data.get('dialect') or '',
            host=data.get('host') or '',
            port=data.get('port') or None,
            database=data.get('database') or '',
            options=data.get('options') or {},
            url=data.get('url') or '',
            username=data.get('username') or '',
            password=password,
            config=config,
            max_rows=data.get('max_rows') or None,
            timeout_seconds=data.get('timeout_seconds') or 30,
        )
        return Response(test_connection(conn))

    @action(detail=False, methods=['post'], url_path='import')
    def import_json(self, request):
        """Imports one (or more) connections from JSON previously produced by
        a connection row's own Export action in the manager UI.

        Upserts by id: an existing connection is updated (its saved secrets
        are preserved unless the imported row supplies new ones -- see the
        serializer), a new id is created. The manager only ever posts a
        single-item list here (per-item import, not a bulk restore -- see
        specs/connection.md), but the endpoint itself doesn't care how many
        rows are in the payload.
        """
        payload = request.data if isinstance(request.data, list) else request.data.get('connections', [])
        created, updated, errors = [], [], []
        for row in payload:
            conn_id = row.get('id')
            if not conn_id:
                errors.append({'error': 'missing id', 'row': row})
                continue
            instance = DataConnection.objects.filter(pk=conn_id).first()
            serializer = DataConnectionSerializer(instance, data=row, partial=True)
            if serializer.is_valid():
                serializer.save()
                (updated if instance else created).append(conn_id)
            else:
                errors.append({'id': conn_id, 'errors': serializer.errors})
        return Response({'created': created, 'updated': updated, 'errors': errors})
