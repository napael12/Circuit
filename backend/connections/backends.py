"""Extendable connection-type interface (specs/connection.md).

Each DataConnection.type maps to a ConnectionBackend subclass below, the
single place both "how do I build a live client/engine for this connection"
and "what does Test mean for this type" live -- replacing the old ad-hoc
if/elif chain that used to sit in datastore.engine.test_connection().

To add a new connection type: add a TYPE_* choice to DataConnection, add a
ConnectionBackend subclass here, and register it in _BACKENDS.
"""
from __future__ import annotations

import json
from datetime import timedelta

import requests
import sqlalchemy
from django.utils import timezone
from sqlalchemy import text as sa_text
from sqlalchemy.exc import SQLAlchemyError

from breadboard.templating import substitute_setting_vars

from .models import DataConnection


def _resolved(value):
    """Resolves ${VARIABLE} against portal.models.Setting (or ${env.NAME}
    against this process's own OS environment) for string config values."""
    if isinstance(value, str):
        return substitute_setting_vars(value)
    return value


def _resolved_deep(value):
    """_resolved, recursively through a dict/list -- used for oauth_raw_body/oauth_extra_params, which are nested structures rather than a single string."""
    if isinstance(value, dict):
        return {k: _resolved_deep(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolved_deep(v) for v in value]
    return _resolved(value)


class ConnectionBackend:
    """Base class for a connection type implementation."""

    def __init__(self, conn):
        self.conn = conn

    def cfg(self, key: str, default=None):
        return _resolved((self.conn.config or {}).get(key, default))

    @property
    def timeout(self) -> int:
        return self.conn.timeout_seconds or 30

    def test(self) -> dict:
        """Returns {"ok": bool, "message": str} -- the manager UI's Test button."""
        raise NotImplementedError


class SqlConnectionBackend(ConnectionBackend):
    """SQLAlchemy URL -- OR -- discrete host/port/database/username/password."""

    def build_url(self):
        url = _resolved(self.conn.url)
        if url:
            return url
        return sqlalchemy.engine.URL.create(
            drivername=_resolved(self.conn.dialect),
            username=_resolved(self.conn.username) or None,
            password=_resolved(self.conn.password) or None,
            host=_resolved(self.conn.host) or None,
            port=self.conn.port or None,
            database=_resolved(self.conn.database) or None,
            query=self.conn.options or {},
        )

    def _connect_args(self) -> dict:
        # Best-effort connect timeout: the kwarg name isn't uniform across
        # DBAPIs, so dialects that don't recognize connect_timeout/timeout
        # are simply left to their own default rather than failing to connect.
        dialect = (_resolved(self.conn.dialect) or '').split('+')[0]
        if dialect in ('postgresql', 'mysql'):
            return {'connect_timeout': self.timeout}
        if dialect == 'mssql':
            return {'timeout': self.timeout}
        return {}

    def build_engine(self):
        return sqlalchemy.create_engine(
            self.build_url(), pool_pre_ping=True, connect_args=self._connect_args(),
        )

    def test(self) -> dict:
        query = self.cfg('test_query') or 'SELECT 1'
        try:
            engine = self.build_engine()
            try:
                with engine.connect() as db_conn:
                    db_conn.execute(sa_text(query))
                return {'ok': True, 'message': 'Connected successfully.'}
            finally:
                engine.dispose()
        except SQLAlchemyError as exc:
            return {'ok': False, 'message': str(exc.__cause__ or exc)}
        except Exception as exc:  # noqa: BLE001 - surface any driver/config error to the UI
            return {'ok': False, 'message': str(exc)}


class SnowflakeConnectionBackend(SqlConnectionBackend):
    """snowflake-connector-python, via the snowflake-sqlalchemy dialect so
    this drops straight into the same SQLAlchemy query path (datastore.engine)
    every other type=sql connection already uses -- snowflake-sqlalchemy's
    dialect builds its DBAPI connection by calling
    snowflake.connector.connect(**kwargs) itself, so config here really is
    (most of) that call's kwargs.

    Unlike SqlConnectionBackend, everything lives in `config` (see
    DataConnection.config's own doc comment) rather than the generic
    host/port/database/username/password columns -- account/user/password/
    warehouse/database/schema/role don't map cleanly onto those (e.g. there's
    no single column for "account"), and keeping them together in one dict is
    exactly what the manager UI's "Connection settings" JSON tab edits
    directly, same as a type=s3/http connection's own settings.
    """

    #: config keys that aren't real connect() kwargs -- dropped before
    #: building the URL rather than erroring out as an unknown snowflake-
    #: connector parameter.
    _NON_CONNECT_KEYS = {'test_query'}

    def build_url(self):
        from snowflake.sqlalchemy import URL

        cfg = {
            key: _resolved(value)
            for key, value in (self.conn.config or {}).items()
            if key not in self._NON_CONNECT_KEYS and value not in (None, '')
        }
        return URL(**cfg)

    def _connect_args(self) -> dict:
        return {'login_timeout': self.timeout}


#: Fallback token lifetime (seconds) when a token response has no usable expires_in.
DEFAULT_OAUTH_TTL = 3600
#: Renew this many seconds before the token's real expiry, so a token already
#: in flight for a request doesn't die mid-request.
OAUTH_EXPIRY_BUFFER_SECONDS = 30


class HttpConnectionBackend(ConnectionBackend):
    """Authorization for arbitrary HTTP endpoints (specs/http-connection.md).

    Used by datastore.services for source_type='serialized' access_type='http'
    requests: request_kwargs() returns headers/params/auth to merge into
    whatever request the datastore itself is making, so this backend never
    issues the "real" data request -- only Test does, and only to sanity-check
    credentials against the optional Authorization URL (auth_type=oauth: the
    token endpoint itself, see test() below).
    """

    AUTH_NONE = 'none'
    AUTH_BASIC = 'basic'
    AUTH_API_KEY = 'api_key'
    AUTH_BEARER = 'bearer'
    AUTH_OAUTH = 'oauth'
    AUTH_DIGEST = 'digest'

    @property
    def auth_url(self) -> str:
        return _resolved(self.conn.url) or ''

    def request_kwargs(self) -> dict:
        headers = dict(self.cfg('headers') or {})
        params = {}
        auth = None
        auth_type = self.cfg('auth_type') or self.AUTH_NONE
        if auth_type == self.AUTH_BASIC:
            auth = (_resolved(self.conn.username), _resolved(self.conn.password))
        elif auth_type == self.AUTH_API_KEY:
            key_name = self.cfg('api_key_name') or 'X-API-Key'
            key_value = self.cfg('api_key_value')
            if key_value:
                if self.cfg('api_key_location') == 'query':
                    params[key_name] = key_value
                else:
                    headers[key_name] = key_value
        elif auth_type == self.AUTH_BEARER:
            token = self.cfg('token')
            if token:
                headers.setdefault('Authorization', f'Bearer {token}')
        elif auth_type == self.AUTH_OAUTH:
            headers.setdefault('Authorization', f'Bearer {self.get_oauth_token()}')
        elif auth_type == self.AUTH_DIGEST:
            from requests.auth import HTTPDigestAuth

            auth = HTTPDigestAuth(_resolved(self.conn.username), _resolved(self.conn.password))
        return {'headers': headers, 'params': params, 'auth': auth, 'timeout': self.timeout}

    def _oauth_token_request(self) -> requests.Response:
        """POSTs the Client Credentials token request -- the one place that builds it, shared by get_oauth_token (real, cached/persisted use) and test() (always fresh, never persisted). Raises requests.RequestException on a network-level failure; a non-2xx/non-JSON response is instead surfaced as a normal Response for the caller to interpret."""
        url = self.auth_url
        if not url:
            raise ValueError('No token URL configured (set the connection\'s Authorization URL).')
        body_mode = self.cfg('oauth_body_mode') or 'form'
        client_auth = self.cfg('oauth_client_auth') or 'body'
        client_id = self.cfg('oauth_client_id') or ''
        client_secret = self.cfg('oauth_client_secret') or ''
        auth = (client_id, client_secret) if client_auth == 'basic' else None

        if body_mode == 'json':
            raw = self.cfg('oauth_raw_body')
            try:
                payload = _resolved_deep(json.loads(raw)) if isinstance(raw, str) else _resolved_deep(raw or {})
            except json.JSONDecodeError as exc:
                raise ValueError(f'Raw request JSON is invalid: {exc}') from exc
            return requests.post(url, json=payload, auth=auth, timeout=self.timeout)

        data = {'grant_type': 'client_credentials'}
        if client_auth != 'basic':
            data['client_id'] = client_id
            data['client_secret'] = client_secret
        scope = self.cfg('oauth_scope')
        if scope:
            data['scope'] = scope
        data.update(_resolved_deep(self.cfg('oauth_extra_params') or {}))
        return requests.post(url, data=data, auth=auth, timeout=self.timeout)

    def _fetch_oauth_token(self) -> tuple[str, int]:
        """Performs the token request and returns (access_token, ttl_seconds). Raises ValueError/requests.RequestException with a message meant to reach the user as-is (Test's message, or a failed datastore fetch's error)."""
        resp = self._oauth_token_request()
        try:
            body = resp.json()
        except ValueError as exc:
            raise ValueError(f'Token endpoint returned a non-JSON response (HTTP {resp.status_code}).') from exc
        if not resp.ok:
            detail = body.get('error_description') or body.get('error') if isinstance(body, dict) else None
            raise ValueError(f'Token endpoint returned HTTP {resp.status_code}' + (f': {detail}' if detail else '.'))
        token = body.get('access_token') if isinstance(body, dict) else None
        if not token:
            raise ValueError('Token endpoint response has no "access_token".')
        ttl = body.get('expires_in') if isinstance(body, dict) else None
        ttl = int(ttl) if isinstance(ttl, (int, float)) and ttl > 0 else DEFAULT_OAUTH_TTL
        return token, ttl

    def get_oauth_token(self) -> str:
        """The cached/lazily-renewed token for a *saved* connection (self.conn.pk is a real row) -- reads fresh from the DB rather than trusting self.conn's own possibly-stale in-memory copy (another worker process may have already renewed it), and only actually calls the token endpoint when there's no valid cached token left. Renews on demand, from whichever request happens to need it -- there's no background poller, so a connection nobody's using just sits with a stale token until something asks for it again."""
        current = DataConnection.objects.filter(pk=self.conn.pk).values('oauth_token', 'oauth_token_expires_at').first()
        if current and current['oauth_token'] and current['oauth_token_expires_at']:
            if timezone.now() < current['oauth_token_expires_at'] - timedelta(seconds=OAUTH_EXPIRY_BUFFER_SECONDS):
                return current['oauth_token']

        token, ttl = self._fetch_oauth_token()
        expires_at = timezone.now() + timedelta(seconds=ttl)
        DataConnection.objects.filter(pk=self.conn.pk).update(oauth_token=token, oauth_token_expires_at=expires_at)
        return token

    def test(self) -> dict:
        auth_type = self.cfg('auth_type') or self.AUTH_NONE
        if auth_type == self.AUTH_OAUTH:
            # Always a fresh request, never the cached/persisted token -- a
            # not-yet-saved connection (test-config) has no real row to read/
            # write anyway, and Test is meant to prove the handshake itself
            # works, not to exercise the cache.
            try:
                _token, ttl = self._fetch_oauth_token()
                return {'ok': True, 'message': f'Obtained an access token (valid {ttl}s).'}
            except (ValueError, requests.RequestException) as exc:
                return {'ok': False, 'message': str(exc)}
        try:
            kwargs = self.request_kwargs()
            url = self.auth_url
            if not url:
                return {'ok': True, 'message': 'Configuration saved (no Authorization URL to test against).'}
            resp = requests.get(
                url, headers=kwargs['headers'], params=kwargs['params'] or None,
                auth=kwargs['auth'], timeout=kwargs['timeout'],
            )
            return {'ok': resp.ok, 'message': f'HTTP {resp.status_code}'}
        except requests.RequestException as exc:
            return {'ok': False, 'message': str(exc)}
        except Exception as exc:  # noqa: BLE001
            return {'ok': False, 'message': str(exc)}


class S3ConnectionBackend(ConnectionBackend):
    """Access key, secret key, region. Blank access/secret = anonymous/public bucket."""

    def client(self):
        import boto3
        from botocore import UNSIGNED
        from botocore.client import Config

        access_key = self.cfg('access_key')
        secret_key = self.cfg('secret_key')
        region = self.cfg('region') or None
        if access_key and secret_key:
            return boto3.client(
                's3', aws_access_key_id=access_key, aws_secret_access_key=secret_key,
                region_name=region, config=Config(connect_timeout=self.timeout, read_timeout=self.timeout),
            )
        return boto3.client(
            's3', region_name=region,
            config=Config(signature_version=UNSIGNED, connect_timeout=self.timeout, read_timeout=self.timeout),
        )

    def test(self) -> dict:
        try:
            client = self.client()
            bucket = self.cfg('bucket')
            if bucket:
                client.list_objects_v2(Bucket=bucket, MaxKeys=1)
                return {'ok': True, 'message': f'Listed bucket "{bucket}" successfully.'}
            client.list_buckets()
            return {'ok': True, 'message': 'Authenticated successfully.'}
        except Exception as exc:  # noqa: BLE001 - surface any boto3/credentials error to the UI
            return {'ok': False, 'message': str(exc)}


_BACKENDS: dict[str, type[ConnectionBackend]] = {
    'sql': SqlConnectionBackend,
    'snowflake': SnowflakeConnectionBackend,
    's3': S3ConnectionBackend,
    'http': HttpConnectionBackend,
}


def get_backend(conn) -> ConnectionBackend:
    cls = _BACKENDS.get(conn.type)
    if cls is None:
        raise ValueError(f'Unknown connection type: {conn.type}')
    return cls(conn)


def test_connection(conn) -> dict:
    """Lightweight connectivity check for the manager UI's "Test" button.

    Always builds a throwaway engine/client/request rather than touching
    datastore.engine's cache -- this also gets called with unsaved,
    in-progress edits (see connections/views.py test_config), so reusing the
    cache could either poison it with a connection that's never saved, or
    return a stale result for credentials that are being changed but not yet
    persisted.
    """
    return get_backend(conn).test()
