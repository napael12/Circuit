"""``${name}`` template-variable substitution for datastore SQL/REST definitions.

Distinct from SQL's ``:name`` SQLAlchemy bound parameters (see
datastore/engine.py, which deliberately avoids string substitution for those)
-- ``${name}`` is a literal text substitution, matching the syntax already
used for panel HTML templates (see frontend HtmlControl.tsx), now extended to
datastore SQL text and REST URLs/paths/bodies so a definition can splice a
parameter directly into the text rather than only bind it. Staff-only
(datastore/action definitions are staff-managed), so the injection surface is
the same as hand-editing the SQL/URL itself.
"""
from __future__ import annotations

import re

_VAR_RE = re.compile(r'\$\{(\w+)\}')


def discover_template_vars(text: str | None) -> list[str]:
    """Returns the ${name} variable names referenced in `text`, in first-seen order, deduped."""
    seen: dict[str, None] = {}
    for match in _VAR_RE.finditer(text or ''):
        seen.setdefault(match.group(1), None)
    return list(seen)


def substitute_template_vars(text: str | None, params: dict) -> str | None:
    """Replaces ${name} in `text` with str(params[name]); leaves unresolved ${name} as-is."""
    if not text:
        return text

    def repl(match: re.Match) -> str:
        name = match.group(1)
        value = params.get(name)
        return match.group(0) if value is None else str(value)

    return _VAR_RE.sub(repl, text)


def substitute_setting_vars(text: str | None, profile: str = '*') -> str | None:
    """Replaces ${name} in `text` with portal.models.Setting values.

    Distinct from substitute_template_vars above: this resolves against
    centrally-configured Settings (specs/connection.md's "Allow to use
    variables (${VARIABLE}) configured in settings"), not caller-supplied
    runtime params -- used to keep connection secrets/environment values out
    of the connection record itself. Leaves unresolved ${name} as-is.
    """
    if not text or '${' not in text:
        return text

    from portal.models import Setting  # local import: avoids a hard app-load-order dependency

    def repl(match: re.Match) -> str:
        name = match.group(1)
        setting = Setting.objects.filter(profile=profile, key=name).first()
        return match.group(0) if setting is None else setting.value

    return _VAR_RE.sub(repl, text)
