import re

from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.permissions import IsAdminOrReadOnly

from .models import SqlDef
from .serializers import SqlDefSerializer

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
