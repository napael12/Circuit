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


class RestConnectionBackend(ConnectionBackend):
    """Method, auth type (auth URL/basic/form/token/none), headers, request body."""

    AUTH_NONE = 'none'
    AUTH_BASIC = 'basic'
    AUTH_FORM = 'form'
    AUTH_TOKEN = 'token'
    AUTH_URL = 'auth_url'

    @property
    def base_url(self) -> str:
        return _resolved(self.conn.url) or ''

    def _fetch_token(self) -> str | None:
        """Runs the auth_url/form handshake and pulls a token out of the JSON response."""
        auth_type = self.cfg('auth_type')
        auth_url = self.cfg('auth_url') or (self.base_url if auth_type == self.AUTH_FORM else None)
        if not auth_url:
            return None
        creds = {'username': _resolved(self.conn.username), 'password': _resolved(self.conn.password)}
        try:
            if auth_type == self.AUTH_URL:
                resp = requests.post(auth_url, json=creds, timeout=self.timeout)
            else:
                resp = requests.post(auth_url, data=creds, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            return data.get('token') or data.get('access_token') or data.get('id_token')
        except (requests.RequestException, ValueError):
            return None

    def request_kwargs(self) -> dict:
        headers = dict(self.cfg('headers') or {})
        auth = None
        auth_type = self.cfg('auth_type') or self.AUTH_NONE
        if auth_type == self.AUTH_BASIC:
            auth = (_resolved(self.conn.username), _resolved(self.conn.password))
        elif auth_type == self.AUTH_TOKEN:
            token = self.cfg('token')
            if token:
                headers.setdefault('Authorization', f'Bearer {token}')
        elif auth_type in (self.AUTH_URL, self.AUTH_FORM):
            token = self._fetch_token()
            if token:
                headers.setdefault('Authorization', f'Bearer {token}')
        return {'headers': headers, 'auth': auth, 'timeout': self.timeout}

    def test(self) -> dict:
        try:
            auth_type = self.cfg('auth_type') or self.AUTH_NONE
            if auth_type in (self.AUTH_URL, self.AUTH_FORM):
                token = self._fetch_token()
                if token:
                    return {'ok': True, 'message': 'Authenticated successfully.'}
                return {'ok': False, 'message': 'Authentication did not return a token.'}
            if not self.base_url:
                return {'ok': False, 'message': 'No URL configured.'}
            method = (self.cfg('method') or 'GET').upper()
            resp = requests.request(method, self.base_url, **self.request_kwargs())
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
    # specs/datastore-streamline.md: File system is no longer a creatable
    # connection type, but 'rest' stays registered -- see DataConnection's
    # own class docstring for why RestConnectionBackend can't be removed too.
    'rest': RestConnectionBackend,
    's3': S3ConnectionBackend,
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
