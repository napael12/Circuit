"""SQLAlchemy-based query engine.

Replaces the legacy GenericQueryDAO: connections are still configured as
metadata (connections.models.DataConnection) and resolved to a live engine
lazily on first use, but execution always goes through SQLAlchemy bound
parameters (``:name``) instead of the legacy app's naive
``sql.replace("@name", value)`` string substitution.

URL-building and the "Test" check itself live in connections.backends (the
extendable per-type interface from specs/connection.md); this module only
owns engine caching and running the query.
"""
from __future__ import annotations

import json
from threading import Lock

from sqlalchemy import text
from sqlalchemy.engine import Engine

from connections.backends import get_backend
from connections.models import DataConnection

_engine_cache: dict[str, Engine] = {}
_lock = Lock()


def get_engine(conn: DataConnection) -> Engine:
    """Return a cached SQLAlchemy engine for a DataConnection, building it on first use."""
    with _lock:
        engine = _engine_cache.get(conn.id)
        if engine is None:
            engine = get_backend(conn).build_engine()
            _engine_cache[conn.id] = engine
        return engine


def invalidate(conn_id: str) -> None:
    """Drop a cached engine, e.g. after its DataConnection is edited or deleted."""
    with _lock:
        engine = _engine_cache.pop(conn_id, None)
    if engine is not None:
        engine.dispose()


def _normalize_cell(value: object) -> object:
    """A driver-deserialized JSON/JSONB column (dict or list) comes back
    embedded as a nested object -- re-encode it as a JSON string instead, so
    it round-trips through the datastore's own JSON output as a single
    string column like every other cell, rather than silently becoming
    structured JSON only for this one column type."""
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return value


def execute_query(
    conn: DataConnection,
    sql_text: str,
    params: dict | None = None,
    row_limit: int | None = None,
) -> list[dict]:
    """Run a SELECT with bound parameters and return rows as plain dicts.

    ``row_limit`` (a per-call override, e.g. from the manager's Preview) is
    further capped by the connection's own configured max_rows, if set.
    """
    engine = get_engine(conn)
    with engine.connect() as db_conn:
        result = db_conn.execute(text(sql_text), params or {})
        rows = [{k: _normalize_cell(v) for k, v in row.items()} for row in result.mappings()]
    limit = row_limit
    if conn.max_rows is not None:
        limit = conn.max_rows if limit is None else min(limit, conn.max_rows)
    if limit is not None:
        rows = rows[:limit]
    return rows
