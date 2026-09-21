"""Background cron scheduler for Datastore(refresh_mode=scheduled) rows.

Started once from DatastoreConfig.ready(). Uses APScheduler with the
django-apscheduler jobstore so schedules survive process restarts, and
(re)builds its job list from the Datastore table on startup and whenever a
scheduled Datastore is saved (see signal in apps.py).
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from django_apscheduler.jobstores import DjangoJobStore

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _job_id(ds_id: str) -> str:
    return f'datastore-refresh-{ds_id}'


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone='UTC')
        _scheduler.add_jobstore(DjangoJobStore(), 'default')
    return _scheduler


def sync_job(ds) -> None:
    """Add/update/remove the APScheduler job for one Datastore based on its current state."""
    from .models import Datastore  # avoid import cycle at module load time

    scheduler = get_scheduler()
    job_id = _job_id(ds.id)
    scheduler.remove_job(job_id) if scheduler.get_job(job_id) else None

    if ds.refresh_mode == Datastore.REFRESH_SCHEDULED and ds.cron_schedule:
        from .services import refresh_scheduled

        scheduler.add_job(
            refresh_scheduled,
            trigger=CronTrigger.from_crontab(ds.cron_schedule),
            id=job_id,
            args=[ds.id],
            replace_existing=True,
            max_instances=1,
        )


def start() -> None:
    from .models import Datastore

    scheduler = get_scheduler()
    if scheduler.running:
        return
    for ds in Datastore.objects.filter(refresh_mode=Datastore.REFRESH_SCHEDULED).exclude(cron_schedule=''):
        sync_job(ds)
    try:
        from portal.backup import sync_job as sync_backup_job

        sync_backup_job()
    except Exception:  # noqa: BLE001 - a bad backup cron must not stop datastore scheduling
        logger.exception('Could not schedule configuration backup')
    scheduler.start()
    logger.info('Datastore scheduler started')
