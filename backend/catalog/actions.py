"""Executes catalog.models.Action definitions (outbound HTTP calls).

Mirrors the legacy ActionService: an Action either names a REST
DataConnection (base url + auth) plus a relative path, or carries a full url
of its own. The connection's own auth type (none/basic/form/token/auth url)
is applied via connections.backends.RestConnectionBackend, so every Action
against the same connection shares one auth implementation with that
connection's own "Test" button.
"""
from __future__ import annotations

import requests

from breadboard.templating import substitute_template_vars
from connections.backends import RestConnectionBackend, get_backend

from .models import Action


def run_action(action: Action, params: dict | None = None) -> requests.Response:
    params = {**action.default_params, **(params or {})}

    if action.connection_id:
        backend = get_backend(action.connection)
        assert isinstance(backend, RestConnectionBackend)
        base = substitute_template_vars(backend.base_url, params).rstrip('/')
        path = substitute_template_vars(action.path, params) if action.path else ''
        url = f"{base}/{path.lstrip('/')}" if path else base
        request_kwargs = backend.request_kwargs()
    else:
        url = substitute_template_vars(action.url, params)
        request_kwargs = {'headers': {}, 'auth': None, 'timeout': 30}

    if action.headers:
        request_kwargs['headers'] = {**request_kwargs['headers'], **action.headers}

    body = substitute_template_vars(action.request_body, params) or None

    if action.request_type == Action.POST:
        return requests.post(url, params=params, data=body, **request_kwargs)
    return requests.get(url, params=params, **request_kwargs)
