"""
URL configuration for breadboard project.

/django-admin/  Django's built-in admin (connection/panel/user CRUD during
                development; the React "manager" UI is the intended admin
                surface long-term, see specs/main.md).
/api/           DRF API (see breadboard/api_urls.py).
/ws/            Websocket routes (see datastore/routing.py, wired in asgi.py).
everything else Falls through to the built React app (monosite serving).
"""
from django.contrib import admin
from django.urls import include, path, re_path

from .views import FrontendIndexView

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/', include('breadboard.api_urls')),
    re_path(r'^(?!api/|django-admin/|static/).*$', FrontendIndexView.as_view()),
]
