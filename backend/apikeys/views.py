from django.db.models import Count, Max, Min
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.permissions import IsAdmin
from breadboard.slugs import unique_slug_id

from .models import ApiKey, ApiKeyUsage
from .serializers import ApiKeySerializer

# Mirrors panels/views.py's USAGE_HISTORY_LIMIT -- a snapshot view, not a
# paginated report.
USAGE_HISTORY_LIMIT = 2000


class ApiKeyViewSet(ModelViewSet):
    """Portal Management > API Keys (specs/api_datastore.md). Admin-only,
    same as Users/Roles -- these grant programmatic access on a user's
    behalf, not something every Manager visitor should see or create.
    """

    queryset = ApiKey.objects.select_related('user', 'created_by').all()
    serializer_class = ApiKeySerializer
    permission_classes = [IsAdmin]

    def create(self, request, *args, **kwargs):
        """Unlike every other viewset here, the id is never client-supplied
        (derived from name, like Panel/Datastore "Clone") and the response
        carries the plaintext key exactly once -- it's never retrievable
        again afterward (only key_prefix/key_hash are stored).
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data['name']
        secret, key_hash = ApiKey.generate()
        instance = ApiKey.objects.create(
            id=unique_slug_id(ApiKey, name),
            name=name,
            user=serializer.validated_data['user'],
            key_prefix=secret[:11],
            key_hash=key_hash,
            created_by=request.user,
        )
        data = ApiKeySerializer(instance).data
        data['key'] = secret
        return Response(data, status=201)

    @action(detail=True, url_path='usage-summary')
    def usage_summary(self, request, pk=None):
        api_key = self.get_object()
        qs = ApiKeyUsage.objects.filter(api_key=api_key)
        totals = qs.aggregate(first_call=Min('accessed_at'), last_call=Max('accessed_at'))
        by_mode = {row['mode']: row['count'] for row in qs.values('mode').annotate(count=Count('id'))}
        return Response(
            {
                'total_calls': qs.count(),
                'pull_calls': by_mode.get(ApiKeyUsage.MODE_PULL, 0),
                'push_calls': by_mode.get(ApiKeyUsage.MODE_PUSH, 0),
                'first_call': totals['first_call'],
                'last_call': totals['last_call'],
            }
        )

    @action(detail=True)
    def usage(self, request, pk=None):
        api_key = self.get_object()
        rows = ApiKeyUsage.objects.filter(api_key=api_key)[:USAGE_HISTORY_LIMIT]
        return Response(
            [
                {
                    'id': row.id,
                    'accessed_at': row.accessed_at,
                    'mode': row.mode,
                    'datastore_id': row.datastore_id,
                    'ip_address': row.ip_address,
                    'ok': row.ok,
                    'detail': row.detail,
                }
                for row in rows
            ]
        )
