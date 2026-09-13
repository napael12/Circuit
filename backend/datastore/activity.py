"""Tracks whether any dashboard/control currently has a scheduled Datastore's
websocket open, so the cron scheduler (datastore.services.refresh_scheduled)
knows when to stop -- and later resume -- actually running it.

DatastoreConsumer (an ASGI coroutine) and refresh_scheduled (called by
APScheduler on its own background thread) both live in the same process --
see CHANNEL_LAYERS' InMemoryChannelLayer and datastore.scheduler's in-process
BackgroundScheduler -- so a plain lock-guarded module dict is enough here;
nothing here needs to survive a process restart or be visible cross-process.
"""
from __future__ import annotations

import threading

from django.utils import timezone

_lock = threading.Lock()
_connection_counts: dict[str, int] = {}
_last_active_at: dict[str, object] = {}


def connect(ds_id: str) -> bool:
    """Record one more open websocket for ds_id. Returns True if this is the
    connection that just ended an idle period (including "nobody has ever
    connected since this process started") -- the signal to run an immediate
    refresh rather than waiting for the next cron tick.
    """
    with _lock:
        was_idle = _connection_counts.get(ds_id, 0) == 0
        _connection_counts[ds_id] = _connection_counts.get(ds_id, 0) + 1
        _last_active_at[ds_id] = timezone.now()
        return was_idle


def disconnect(ds_id: str) -> None:
    with _lock:
        count = _connection_counts.get(ds_id, 0) - 1
        if count <= 0:
            _connection_counts.pop(ds_id, None)
            _last_active_at[ds_id] = timezone.now()
        else:
            _connection_counts[ds_id] = count


def has_active_connections(ds_id: str) -> bool:
    """Whether any websocket is currently open for this datastore -- the
    "active controls" check specs/api_datastore.md's push mode needs (only
    process/broadcast pushed data when at least one panel/control is
    actually listening).
    """
    with _lock:
        return _connection_counts.get(ds_id, 0) > 0


def is_idle(ds_id: str, idle_timeout_seconds: int | None) -> bool:
    """False whenever idle_timeout_seconds is falsy (0/None -- "never stop")
    or at least one client is currently connected. Otherwise True once
    nobody has been connected for longer than idle_timeout_seconds --
    including before the first-ever connection, so a freshly configured
    scheduled datastore doesn't start grinding before any dashboard has
    opened it.
    """
    if not idle_timeout_seconds:
        return False
    with _lock:
        if _connection_counts.get(ds_id, 0) > 0:
            return False
        last_active = _last_active_at.get(ds_id)
    if last_active is None:
        return True
    return (timezone.now() - last_active).total_seconds() > idle_timeout_seconds
