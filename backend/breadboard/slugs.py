"""Turns a display name into a unique SlugField-safe primary key -- shared by
every model's "Clone" action (Panel, DataConnection, Datastore), where the
caller supplies a name/description via a prompt and the id is derived from it
rather than typed in directly.
"""
from __future__ import annotations

import re

_DISALLOWED = re.compile(r'[^A-Za-z0-9_-]+')
_DASH_RUN = re.compile(r'-{2,}')


def slug_id(text: str) -> str:
    """Case-preserving slug (existing ids like "PhoneNumbers"/"D2" are mixed
    case, so this doesn't lowercase like django.utils.text.slugify does) --
    just enough to satisfy SlugField's `^[-a-zA-Z0-9_]+$`.
    """
    candidate = _DASH_RUN.sub('-', _DISALLOWED.sub('-', text.strip())).strip('-')
    return candidate or 'item'


def unique_slug_id(model, base_text: str, max_length: int = 30) -> str:
    """Returns a `model`-unique slug id derived from `base_text`, appending
    -2, -3, ... on collision. `model` must have a slug-like `id` primary key.
    """
    base = slug_id(base_text)[:max_length]
    candidate = base
    suffix = 2
    while model.objects.filter(pk=candidate).exists():
        tail = f'-{suffix}'
        candidate = f'{base[: max_length - len(tail)]}{tail}'
        suffix += 1
    return candidate
