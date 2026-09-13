import os
import sys

from django.apps import AppConfig


class DatastoreConfig(AppConfig):
    name = 'datastore'

    def ready(self):
        from django.db.models.signals import post_save, post_delete

        from .models import Datastore

        def _sync(sender, instance, **kwargs):
            from .scheduler import sync_job
            sync_job(instance)

        def _remove(sender, instance, **kwargs):
            from .scheduler import get_scheduler, _job_id
            scheduler = get_scheduler()
            job_id = _job_id(instance.id)
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)

        post_save.connect(_sync, sender=Datastore)
        post_delete.connect(_remove, sender=Datastore)

        # Only start the scheduler for an actual server process: skip it for
        # migrate/makemigrations/shell/test/etc, and avoid a duplicate start
        # in the dev-server autoreloader's parent process.
        via_manage_py = 'manage.py' in sys.argv[0] if sys.argv else False
        if via_manage_py:
            is_runserver = len(sys.argv) > 1 and sys.argv[1] == 'runserver'
            if not is_runserver or os.environ.get('RUN_MAIN') != 'true':
                return

        from .scheduler import start
        try:
            start()
        except Exception:  # noqa: BLE001 - DB may not be migrated yet
            pass
