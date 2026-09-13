from django.contrib.auth import authenticate, login, logout
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from breadboard.permissions import IsAdminOrReadOnly

from .models import NavTree, Setting
from .serializers import NavTreeSerializer, SettingSerializer


class NavTreeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tree, _ = NavTree.objects.get_or_create(pk=1)
        return Response(NavTreeSerializer(tree).data)

    def put(self, request):
        tree, _ = NavTree.objects.get_or_create(pk=1)
        serializer = NavTreeSerializer(tree, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def get_permissions(self):
        if self.request.method == 'PUT':
            return [IsAdminOrReadOnly()]
        return super().get_permissions()


class SettingViewSet(ModelViewSet):
    queryset = Setting.objects.all()
    serializer_class = SettingSerializer
    permission_classes = [IsAdminOrReadOnly]


class BrandingView(APIView):
    """specs/circuit.md: white-label branding -- app name, header icon, and
    favicon. Backed by the same global (profile='*') Settings the Manager UI
    exposes (see the 0002_seed_branding_settings migration for the seeded
    defaults), but readable by anyone -- including pre-login -- since the
    login page and the browser-tab favicon both need it before a session
    exists. Never exposes the rest of the Settings table (which can hold
    ${VAR}-substitution secrets, see breadboard.templating), only these
    three well-known keys.
    """

    permission_classes = [AllowAny]

    DEFAULTS = {
        'app.name': 'Circuit',
        'app.icon': '/circuit.png',
        'app.favicon': '/circuit.png',
    }

    def get(self, request):
        rows = dict(Setting.objects.filter(profile='*', key__in=self.DEFAULTS).values_list('key', 'value'))
        return Response(
            {
                'name': rows.get('app.name') or self.DEFAULTS['app.name'],
                'icon': rows.get('app.icon') or self.DEFAULTS['app.icon'],
                'favicon': rows.get('app.favicon') or self.DEFAULTS['app.favicon'],
            }
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user = authenticate(
            request, username=request.data.get('username'), password=request.data.get('password')
        )
        if user is None:
            return Response({'detail': 'Invalid credentials'}, status=400)
        login(request, user)
        return Response(_session_payload(request))


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response(status=204)


class SessionView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(_session_payload(request))


def _session_payload(request):
    user = request.user
    if not user.is_authenticated:
        return {'authenticated': False}
    return {
        'authenticated': True,
        'username': user.username,
        'is_admin': user.is_superuser,
        'roles': list(user.roles.values_list('name', flat=True)),
    }
