from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from breadboard.permissions import IsAdmin

from .models import Role, User
from .serializers import RoleSerializer, UserSerializer


class RoleViewSet(ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAdmin]

    def destroy(self, request, *args, **kwargs):
        # The built-in ADMIN role is load-bearing (accounts.signals keys
        # is_superuser off it) -- deleting it would silently lock everyone
        # out of Manager, so it's the one row this endpoint refuses to drop.
        if self.get_object().is_admin:
            return Response({'detail': 'The ADMIN role cannot be deleted.'}, status=400)
        return super().destroy(request, *args, **kwargs)


class UserViewSet(ModelViewSet):
    """Admin-only for both read and write -- unlike connections/datastores/etc,
    user records (emails, role membership) aren't something every
    authenticated viewer should be able to list.
    """

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
