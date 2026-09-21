"""Per-datastore result cache (Datastore.cache_seconds, in seconds).

Backed by Django's cache framework (settings.CACHES; process-local memory by
default). The key is the datastore id plus the complete set of input
parameters the run used (default_params overlaid with the caller's), so two
requests only share an entry when every parameter matches. "Clear cache"
bumps a per-datastore version number baked into the key, which orphans every
existing entry at once without needing to enumerate them (they expire on
their own TTL).
"""
from __future__ import annotations

import hashlib
import json

from django.core.cache import cache

_MISS = object()


def _version_key(ds_id: str) -> str:
    return f'ds-cache-version:{ds_id}'


def _version(ds_id: str) -> int:
    return cache.get(_version_key(ds_id), 0)


def make_key(ds_id: str, params: dict) -> str:
    canonical = json.dumps(params, sort_keys=True, default=str)
    digest = hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    return f'ds-cache:{ds_id}:v{_version(ds_id)}:{digest}'


def get(ds_id: str, params: dict):
    """Returns the cached result, or the module's _MISS sentinel (see is_miss)."""
    return cache.get(make_key(ds_id, params), _MISS)


def is_miss(value) -> bool:
    return value is _MISS


def put(ds_id: str, params: dict, result, seconds: int) -> None:
    cache.set(make_key(ds_id, params), result, timeout=seconds)


def clear(ds_id: str) -> None:
    """Invalidates every cached result of one datastore."""
    key = _version_key(ds_id)
    try:
        cache.incr(key)
    except ValueError:  # no version stored yet
        cache.set(key, 1, timeout=None)
