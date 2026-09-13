"""Extendable connection-type interface (specs/connection.md).

Each DataConnection.type maps to a ConnectionBackend subclass below, the
single place both "how do I build a live client/engine for this connection"
and "what does Test mean for this type" live -- replacing the old ad-hoc
if/elif chain that used to sit in datastore.engine.test_connection().

To add a new connection type: add a TYPE_* choice to DataConnection, add a
ConnectionBackend subclass here, and register it in _BACKENDS.
"""
from __future__ import annotations

import requests
import sqlalchemy
from sqlalchemy import text as sa_text
from sqlalchemy.exc import SQLAlchemyError

from breadboard.templating import substitute_setting_vars


def _resolved(value):
    """Resolves ${VARIABLE} against portal.models.Setting for string config values."""
    if isinstance(value, str):
        return substitute_setting_vars(value)
    return value


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


class HttpConnectionBackend(ConnectionBackend):
    """Authorization for arbitrary HTTP endpoints (specs/http-connection.md).

    Used by datastore.services for source_type='serialized' access_type='http'
    requests: request_kwargs() returns headers/params/auth to merge into
    whatever request the datastore itself is making, so this backend never
    issues the "real" data request -- only Test does, and only to sanity-check
    credentials against the optional Authorization URL.
    """

    AUTH_NONE = 'none'
    AUTH_BASIC = 'basic'
    AUTH_API_KEY = 'api_key'
    AUTH_BEARER = 'bearer'
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
        elif auth_type == self.AUTH_DIGEST:
            from requests.auth import HTTPDigestAuth

            auth = HTTPDigestAuth(_resolved(self.conn.username), _resolved(self.conn.password))
        return {'headers': headers, 'params': params, 'auth': auth, 'timeout': self.timeout}

    def test(self) -> dict:
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
