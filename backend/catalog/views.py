import re

from django.http import HttpResponse
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.permissions import IsAdminOrReadOnly

from .actions import run_action
from .models import Action, SqlDef
from .serializers import ActionSerializer, SqlDefSerializer

PARAM_RE = re.compile(r':(\w+)')


class SqlDefViewSet(ModelViewSet):
    queryset = SqlDef.objects.all()
    serializer_class = SqlDefSerializer
    permission_classes = [IsAdminOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True)
    def params(self, request, pk=None):
        """Discover :param bind-variable names referenced in the SQL text."""
        sql_def = self.get_object()
        return Response(sorted(set(PARAM_RE.findall(sql_def.content))))


class ActionViewSet(ModelViewSet):
    queryset = Action.objects.all()
    serializer_class = ActionSerializer
    permission_classes = [IsAdminOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        """Proxies the action's HTTP response body/status/content-type as-is."""
        response = run_action(self.get_object(), request.data)
        return HttpResponse(
            content=response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type'),
        )
