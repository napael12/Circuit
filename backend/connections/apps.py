from django.apps import AppConfig


class ConnectionsConfig(AppConfig):
    name = 'connections'

    def ready(self):
        from django.db.models.signals import post_save, post_delete

        from datastore.engine import invalidate
        from .models import DataConnection

        def _invalidate(sender, instance, **kwargs):
            invalidate(instance.id)

        post_save.connect(_invalidate, sender=DataConnection)
        post_delete.connect(_invalidate, sender=DataConnection)
