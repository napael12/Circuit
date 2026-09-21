from django.urls import path, re_path
from rest_framework.routers import DefaultRouter

from accounts.views import RoleViewSet, UserViewSet
from apikeys.views import ApiKeyViewSet
from catalog.views import SqlDefViewSet
from connections.views import DataConnectionViewSet
from datastore.views import DatastoreViewSet
from panels.views import PanelViewSet
from portal.views import BackupView, BrandingView, LoginView, LogoutView, NavTreeView, SessionView, SettingViewSet

from .public_api import PullDatastoreView, PushDatastoreView

router = DefaultRouter()
router.register('connections', DataConnectionViewSet)
router.register('sqldefs', SqlDefViewSet)
router.register('panels', PanelViewSet)
router.register('datastores', DatastoreViewSet)
router.register('settings', SettingViewSet)
router.register('users', UserViewSet)
router.register('roles', RoleViewSet)
router.register('api-keys', ApiKeyViewSet)

urlpatterns = router.urls + [
    path('nav-tree/', NavTreeView.as_view(), name='nav-tree'),
    path('backup/', BackupView.as_view(), name='backup'),
    path('branding/', BrandingView.as_view(), name='branding'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/logout/', LogoutView.as_view(), name='auth-logout'),
    path('auth/session/', SessionView.as_view(), name='auth-session'),
    # specs/api_datastore.md: the public, API-key-authenticated surface --
    # kept separate from the router above (session-authenticated Manager API).
    # Trailing slash optional (unlike the rest of this API): external
    # clients (curl/Postman/scripts) routinely omit it, and Django's
    # APPEND_SLASH can't redirect a POST without dropping its body -- it
    # raises rather than silently downgrading to GET, so this has to be
    # handled here instead of relying on that middleware.
    re_path(r'^v1/datastores/(?P<pk>[\w-]+)/pull/?$', PullDatastoreView.as_view(), name='datastore-pull'),
    re_path(r'^v1/datastores/(?P<pk>[\w-]+)/push/?$', PushDatastoreView.as_view(), name='datastore-push'),
]
