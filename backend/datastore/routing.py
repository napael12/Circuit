from django.urls import re_path

from .consumers import DatastoreConsumer

websocket_urlpatterns = [
    re_path(r'^ws/datastore/(?P<ds_id>[\w-]+)/$', DatastoreConsumer.as_asgi()),
]
