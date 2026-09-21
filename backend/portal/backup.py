"""Configuration backup: exports every dashboard, connection and datastore to
one JSON file each under <backup path>/{dashboards,connections,datastores}/.

The path and cron expression live in the global (profile='*') Settings
(backup.path / backup.cron, edited from Manager -> Backup); the last run's
outcome is recorded alongside them (backup.last_run / backup.last_result).
Scheduled runs share datastore.scheduler's APScheduler instance.

Records are written through the same serializers the Manager API uses, so
secret fields (connection passwords, tokens) are blanked exactly as in the
per-row Export action -- a backup never puts credentials on disk.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.triggers.cron import CronTrigger

from .models import Setting

logger = logging.getLogger(__name__)

JOB_ID = 'config-backup'
KEY_PATH = 'backup.path'
KEY_CRON = 'backup.cron'
KEY_LAST_RUN = 'backup.last_run'
KEY_LAST_RESULT = 'backup.last_result'


def get_setting(key: str) -> str:
    row = Setting.objects.filter(profile='*', key=key).first()
    return row.value if row else ''


def set_setting(key: str, value: str) -> None:
    Setting.objects.update_or_create(profile='*', key=key, defaults={'value': value[:500]})


def get_config() -> dict:
    return {
        'path': get_setting(KEY_PATH),
        'cron': get_setting(KEY_CRON),
        'last_run': get_setting(KEY_LAST_RUN),
        'last_result': get_setting(KEY_LAST_RESULT),
    }


def _safe_name(value: str) -> str:
    return re.sub(r'[^\w.-]+', '_', str(value)).strip('._') or 'unnamed'


def _write(directory: Path, name: str, data) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f'{_safe_name(name)}.json').write_text(json.dumps(data, indent=2, default=str), encoding='utf-8')


def run_backup(path: str | None = None) -> dict:
    """Runs one backup now. Returns {'ok', 'message', 'counts'}; never raises (the outcome is also stored in Settings)."""
    from connections.models import DataConnection
    from connections.serializers import DataConnectionSerializer
    from datastore.models import Datastore
    from datastore.serializers import DatastoreSerializer
    from panels.models import Panel
    from panels.serializers import PanelSerializer

    path = (path if path is not None else get_setting(KEY_PATH)).strip()
    try:
        if not path:
            raise ValueError('Backup path is not set.')
        root = Path(path)
        sections = [
            ('dashboards', Panel.objects.all(), PanelSerializer),
            ('connections', DataConnection.objects.all(), DataConnectionSerializer),
            ('datastores', Datastore.objects.all(), DatastoreSerializer),
        ]
        counts = {}
        for folder, queryset, serializer in sections:
            count = 0
            for obj in queryset:
                _write(root / folder, obj.pk, serializer(obj).data)
                count += 1
            counts[folder] = count
        message = ', '.join(f'{n} {k}' for k, n in counts.items())
        result = {'ok': True, 'message': f'Backed up {message}.', 'counts': counts}
    except Exception as exc:  # noqa: BLE001 - reported back to the UI, not raised
        logger.exception('Configuration backup failed')
        result = {'ok': False, 'message': str(exc), 'counts': {}}

    set_setting(KEY_LAST_RUN, datetime.now(timezone.utc).isoformat(timespec='seconds'))
    set_setting(KEY_LAST_RESULT, ('OK: ' if result['ok'] else 'FAILED: ') + result['message'])
    return result


def run_scheduled_backup() -> None:
    """APScheduler entry point (must stay module-level so the job store can reference it)."""
    run_backup()


def sync_job() -> None:
    """Adds/replaces/removes the scheduled backup job from the current backup.cron setting."""
    from datastore.scheduler import get_scheduler

    scheduler = get_scheduler()
    if scheduler.get_job(JOB_ID):
        scheduler.remove_job(JOB_ID)
    cron = get_setting(KEY_CRON).strip()
    if cron:
        scheduler.add_job(
            run_scheduled_backup,
            trigger=CronTrigger.from_crontab(cron),
            id=JOB_ID,
            replace_existing=True,
            max_instances=1,
        )
