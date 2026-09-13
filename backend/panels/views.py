import json
from datetime import timedelta

from django.db.models import Count, Max, Min, OuterRef, Q, Subquery
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.access import visible_queryset
from breadboard.permissions import DashboardRoleAccess, IsAdmin, IsAdminOrReadOnly
from breadboard.slugs import unique_slug_id
from datastore.models import Datastore
from datastore.services import run_datastore

from .models import Panel, PanelFavorite, PanelUpdate, PanelUsage
from .serializers import PanelSerializer

# specs/panel_tracking.md's "full history" cap -- a real deployment's usage
# log can grow indefinitely, and this dialog is a snapshot view, not a
# paginated report; the Details tab's own filter narrows within this window.
USAGE_HISTORY_LIMIT = 2000


def _display_name(user) -> str:
    if user is None:
        return 'Unknown'
    full_name = user.get_full_name()
    return full_name or user.username


class PanelViewSet(ModelViewSet):
    # last_accessed_at/last_accessed_by_username are annotated (not real
    # columns) from the most recent PanelUsage row per panel, so the
    # dashboard list can show "last accessed" without a query per row --
    # see PanelSerializer.
    queryset = Panel.objects.select_related('updated_by', 'created_by').annotate(
        last_accessed_at=Max('usage__accessed_at'),
        last_accessed_by_username=Subquery(
            PanelUsage.objects.filter(panel=OuterRef('pk')).order_by('-accessed_at').values('user__username')[:1]
        ),
    )
    serializer_class = PanelSerializer
    permission_classes = [IsAdminOrReadOnly, DashboardRoleAccess]

    def get_queryset(self):
        qs = super().get_queryset()
        # specs/permissions.md #5: restricted dashboards vanish from listings
        # for users without a matching role. Detail lookups (retrieve/
        # download/local-datastore/...) deliberately stay unfiltered here --
        # get_object() below runs the object-permission check against the
        # full queryset so a restricted-but-existing dashboard 403s with a
        # clear message instead of just 404ing like a bad slug would (#6).
        return visible_queryset(qs, self.request.user) if self.action == 'list' else qs

    def get_object(self):
        """Resolves the URL's <pk> segment against either the real id or the
        optional, user-set `slug` (specs/slug.md) -- so /panel/<slug> works
        transparently through every detail action (retrieve, update,
        download, local-datastore) without a separate lookup endpoint.
        """
        queryset = self.filter_queryset(self.get_queryset())
        lookup_value = self.kwargs[self.lookup_url_kwarg or self.lookup_field]
        obj = queryset.filter(Q(pk=lookup_value) | Q(slug=lookup_value)).first()
        if obj is None:
            raise Http404
        self.check_object_permissions(self.request, obj)
        return obj

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)
        PanelUpdate.objects.create(panel=serializer.instance, user=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
        PanelUpdate.objects.create(panel=serializer.instance, user=self.request.user)

    @action(detail=False, url_path='check-slug')
    def check_slug(self, request):
        """Live uniqueness check for the editor's Slug field -- specs/slug.md:
        "validate that the name is unique; do not store if not unique".
        `exclude` omits the panel currently being edited from the check.
        """
        slug = (request.query_params.get('slug') or '').strip()
        if not slug:
            return Response({'available': True})
        qs = Panel.objects.filter(slug=slug)
        exclude_id = request.query_params.get('exclude')
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        return Response({'available': not qs.exists()})

    @action(detail=False, url_path='home-kpis')
    def home_kpis(self, request):
        """specs/homepage.md's Home KPI row: dashboard counts (visible to this
        user) plus a system-wide "how active is this deployment right now"
        signal (distinct users with any recorded visit in the last 24h,
        across every panel regardless of this user's own visibility).
        """
        since = timezone.now() - timedelta(hours=24)
        visible = visible_queryset(Panel.objects.all(), request.user)
        active_users_last_24h = (
            PanelUsage.objects.filter(accessed_at__gte=since, user__isnull=False).values('user_id').distinct().count()
        )
        return Response(
            {
                'total_dashboards': visible.count(),
                'dashboards_last_24h': visible.filter(created_at__gte=since).count(),
                'active_users_last_24h': active_users_last_24h,
            }
        )

    @action(detail=False, url_path='favorite-ids')
    def favorite_ids(self, request):
        """Ids of the current user's own favorited panels (specs/homepage.md)
        -- deliberately just ids, not full Panel objects: the frontend
        already has the full panel list from GET /panels/ and only needs
        this to know which rows to mark/filter as favorites.
        """
        ids = PanelFavorite.objects.filter(user=request.user).values_list('panel_id', flat=True)
        return Response(list(ids))

    @action(detail=True, methods=['post', 'delete'], permission_classes=[IsAuthenticated, DashboardRoleAccess])
    def favorite(self, request, pk=None):
        """Add (POST) or remove (DELETE) this panel from the current user's
        Favorites (specs/homepage.md). Idempotent either way -- toggling an
        already-favorited/unfavorited panel is a no-op, not an error.
        """
        panel = self.get_object()
        if request.method == 'POST':
            PanelFavorite.objects.get_or_create(user=request.user, panel=panel)
        else:
            PanelFavorite.objects.filter(user=request.user, panel=panel).delete()
        return Response(status=204)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        PanelUsage.objects.create(
            panel=instance,
            ip_address=request.META.get('REMOTE_ADDR'),
            user=request.user if request.user.is_authenticated else None,
        )
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, url_path='usage-summary', permission_classes=[IsAdmin])
    def usage_summary(self, request, pk=None):
        """KPIs for the usage-tracking dialog's "Key Indicators" tab
        (specs/panel_tracking.md): total visits, unique users, first/last
        visit, and the top 5 users by visit count.
        """
        panel = self.get_object()
        qs = PanelUsage.objects.filter(panel=panel)
        totals = qs.aggregate(first_visit=Min('accessed_at'), last_visit=Max('accessed_at'))
        total_unique_users = qs.filter(user__isnull=False).values('user_id').distinct().count()

        top_users_qs = (
            qs.filter(user__isnull=False)
            .values('user_id', 'user__username', 'user__first_name', 'user__last_name')
            .annotate(visits=Count('id'), last_visit=Max('accessed_at'))
            .order_by('-visits')[:5]
        )
        top_users = [
            {
                'user_id': row['user_id'],
                'name': (f"{row['user__first_name']} {row['user__last_name']}".strip()) or row['user__username'],
                'visits': row['visits'],
                'last_visit': row['last_visit'],
            }
            for row in top_users_qs
        ]

        return Response(
            {
                'total_visits': qs.count(),
                'total_unique_users': total_unique_users,
                'first_visit': totals['first_visit'],
                'last_visit': totals['last_visit'],
                'top_users': top_users,
            }
        )

    @action(detail=True, permission_classes=[IsAdmin])
    def usage(self, request, pk=None):
        """Full visit history for the usage-tracking dialog's "Details" tab
        (specs/panel_tracking.md) -- most recent first, capped for safety
        (see USAGE_HISTORY_LIMIT). Filtering and CSV export both happen
        client-side against this snapshot, same as any other datatable.
        """
        panel = self.get_object()
        rows = PanelUsage.objects.filter(panel=panel).select_related('user').order_by('-accessed_at')[:USAGE_HISTORY_LIMIT]
        return Response(
            [
                {
                    'id': row.id,
                    'accessed_at': row.accessed_at,
                    'user_id': row.user_id,
                    'user_name': _display_name(row.user),
                    'ip_address': row.ip_address,
                }
                for row in rows
            ]
        )

    @action(detail=True, permission_classes=[IsAdmin])
    def updates(self, request, pk=None):
        """Full save history for the usage-tracking dialog's "Updates" tab --
        the edit-history counterpart to `usage`'s view-history, same shape
        and cap (USAGE_HISTORY_LIMIT) so the frontend can reuse one table.
        """
        panel = self.get_object()
        rows = PanelUpdate.objects.filter(panel=panel).select_related('user').order_by('-updated_at')[:USAGE_HISTORY_LIMIT]
        return Response(
            [{'id': row.id, 'updated_at': row.updated_at, 'user_name': _display_name(row.user)} for row in rows]
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrReadOnly])
    def duplicate(self, request, pk=None):
        """Clones this dashboard: same `content`, a new id (derived from the
        given name, or "{name}-copy" if none given) and no `slug` -- that
        field must stay globally unique, so a fresh clone doesn't inherit one.
        """
        original = self.get_object()
        name = (request.data.get('name') or f'{original.name}-copy').strip()
        clone = Panel.objects.create(
            id=unique_slug_id(Panel, name),
            name=name,
            category=original.category,
            subcategory=original.subcategory,
            description=original.description,
            content=original.content,
            created_by=request.user,
            updated_by=request.user,
        )
        return Response(PanelSerializer(clone).data, status=201)

    @action(detail=True, permission_classes=[IsAuthenticated, DashboardRoleAccess])
    def download(self, request, pk=None):
        """Download a panel as a standalone .json file (shareable dashboard export)."""
        panel = self.get_object()
        response = HttpResponse(
            json.dumps(panel.content, indent=2), content_type='application/json'
        )
        response['Content-Disposition'] = f'attachment; filename="{panel.id}.json"'
        return response

    @action(detail=True, methods=['post'], url_path='local-datastore', permission_classes=[IsAuthenticated, DashboardRoleAccess])
    def local_datastore(self, request, pk=None):
        """Runs a datastore embedded in this panel's own JSON ("local"
        datastores -- see specs/main.md) rather than a shared
        datastore.Datastore row.

        The definition is always read fresh from the saved panel, never
        trusted from the request body, so a viewer can only ever execute
        exactly what a staff editor already saved -- the same trust
        boundary as global datastores, just scoped to one panel. Local
        datastores are on-demand only; embedding a cron schedule for
        something that only exists inside ephemeral panel JSON isn't worth
        the complexity.
        """
        panel = self.get_object()
        local_id = request.data.get('local_id')
        all_datastores = (panel.content or {}).get('datastores', [])
        local_defs = [d for d in all_datastores if d.get('scope') == 'local']
        local = next((d for d in local_defs if d.get('id') == local_id), None)
        if local is None:
            return Response({'detail': 'Unknown local datastore'}, status=404)

        ds = Datastore(
            source_type=local.get('source_type') or Datastore.SOURCE_QUERY,
            access_type=local.get('access_type') or '',
            connection_id=local.get('connection') or None,
            inline_sql=local.get('inline_sql') or '',
            row_limit=local.get('row_limit') or None,
            object_key=local.get('object_key') or '',
            object_url=local.get('object_url') or '',
            body=local.get('body') or '',
            data_url=local.get('data_url') or '',
            request_method=local.get('request_method') or Datastore.METHOD_GET,
            request_params=local.get('request_params') or {},
            request_body=local.get('request_body') or '',
            file_path=local.get('file_path') or '',
            file_expression=local.get('file_expression') or '',
            renderer_type=local.get('renderer_type') or Datastore.RENDERER_NONE,
            renderer_config=local.get('renderer_config') or {},
            default_params=local.get('default_params') or {},
        )
        result = run_datastore(ds, request.data.get('params'))
        return Response({'data': result})

    @action(detail=False, methods=['post'], permission_classes=[IsAdminOrReadOnly])
    def upload(self, request):
        """Create/replace a panel from an uploaded .json dashboard export."""
        upload = request.FILES.get('file')
        content = json.loads(upload.read()) if upload else request.data.get('content')
        panel, created = Panel.objects.update_or_create(
            id=request.data['id'],
            defaults={
                'name': request.data.get('name', request.data['id']),
                'content': content,
                'updated_by': request.user,
            },
        )
        if created:
            panel.created_by = request.user
            panel.save(update_fields=['created_by'])
        PanelUpdate.objects.create(panel=panel, user=request.user)
        return Response(PanelSerializer(panel).data)
