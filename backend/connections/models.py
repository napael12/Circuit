from django.db import models

from .fields import EncryptedJSONField, EncryptedTextField


class DataConnection(models.Model):
    """A configured external data source (was rm_connections in the legacy schema).

    Each ``type`` is resolved by a connections.backends.ConnectionBackend
    implementation (see that module for the extendable-interface pattern
    specs/connection.md asks for): ``sql`` builds a SQLAlchemy engine used by
    datastore.engine, ``s3`` builds a boto3 client, ``http`` supplies
    authorization for datastore.services' source_type=serialized fetches.

    Fields shared by every type live as top-level columns; type-specific
    settings that don't fit those columns (S3 keys/region, an optional SQL
    test query) live in ``config``, which is encrypted at rest like
    ``password``.
    """

    TYPE_SQL = 'sql'
    TYPE_SNOWFLAKE = 'snowflake'
    TYPE_S3 = 's3'
    TYPE_HTTP = 'http'
    TYPE_CHOICES = [
        (TYPE_SQL, 'SQL database'),
        (TYPE_SNOWFLAKE, 'Snowflake'),
        (TYPE_S3, 'S3 bucket'),
        (TYPE_HTTP, 'HTTP'),
    ]

    id = models.SlugField(primary_key=True, max_length=30)
    description = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=15, choices=TYPE_CHOICES, default=TYPE_SQL)

    # type=sql: SQLAlchemy dialect+driver, e.g. "mssql+pyodbc", "postgresql+psycopg2",
    # "mysql+pymysql", "sqlite". type=s3: unused.
    dialect = models.CharField(max_length=60, blank=True)
    host = models.CharField(max_length=255, blank=True)
    port = models.IntegerField(null=True, blank=True)
    database = models.CharField(max_length=255, blank=True)
    # Extra SQLAlchemy URL query params (e.g. {"driver": "ODBC Driver 17 for SQL Server"}).
    options = models.JSONField(default=dict, blank=True)

    # type=sql: only used if set, as a full override SQLAlchemy URL instead of
    # the discrete host/port/database fields above. type=s3: unused. type=http
    # (specs/http-connection.md): optional "Authorization URL" -- required for
    # auth_type=digest (the challenge/response handshake needs a real
    # endpoint), used only by Test for the other auth types.
    url = models.CharField(max_length=500, blank=True)

    # type=sql: db credentials. type=http: Basic/Digest auth username+password.
    # Unused for type=s3.
    username = models.CharField(max_length=120, blank=True)
    password = EncryptedTextField(blank=True)

    # Any ${VARIABLE} in a string value here (or in host/url/username/password
    # above) is resolved against portal.models.Setting at connection-build
    # time -- or against this process's own OS environment for ${env.NAME}
    # -- see breadboard.templating.substitute_setting_vars.
    #
    # type=sql: {"test_query": "..."} (optional, defaults to "SELECT 1").
    # type=snowflake (specs/connection.md): passed essentially as-is to
    # snowflake-connector-python's connect() (via the snowflake-sqlalchemy
    # dialect -- see connections.backends.SnowflakeConnectionBackend). The
    # manager UI's "Configuration" tab offers named fields for the common
    # ones -- {"account": "...", "user": "...", "password": "...",
    #   "warehouse": "...", "database": "...", "schema": "...",
    #   "role": "..."} -- its "Connection settings" tab edits this exact same
    #   dict as JSON instead, so any other connect() kwarg (e.g.
    #   "authenticator", "client_session_keep_alive") can ride along too.
    #   "password" is secret-shaped (see serializers.SECRET_CONFIG_KEYS) --
    #   blanked on read, blank on write keeps the stored value. Also accepts
    #   "test_query" like type=sql, kept out of the connect() kwargs (see
    #   build_url below).
    # type=s3: {"access_key": "...", "secret_key": "...", "region": "...",
    #   "bucket": "..." (optional, used by Test)}. Leave access_key/secret_key
    #   blank for anonymous access to a public bucket.
    # type=http: {"auth_type": "none"|"basic"|"api_key"|"bearer"|"oauth"|"digest",
    #   "api_key_name": "...", "api_key_value": "...",
    #   "api_key_location": "header"|"query", "token": "...",
    #   "digest_algorithm": "MD5"|"SHA-256" (informational -- requests
    #   negotiates the actual algorithm from the server's own challenge),
    #   "headers": {"X-Custom": "..."}}.
    #
    # auth_type=oauth (specs/http-connection.md's OAuth addition -- Client
    # Credentials grant; `url` above is the token endpoint):
    #   "oauth_client_id": "...", "oauth_client_secret": "...",
    #   "oauth_scope": "..." (optional),
    #   "oauth_client_auth": "body"|"basic" (how client_id/secret are sent to
    #     the token endpoint -- default "body"),
    #   "oauth_body_mode": "form"|"json" (default "form" -- grant_type/
    #     client_id/client_secret/scope/oauth_extra_params as a regular OAuth2
    #     form-encoded request; "json" instead POSTs oauth_raw_body verbatim,
    #     for a token endpoint that doesn't speak the standard shape),
    #   "oauth_extra_params": {...} (form mode only -- merged into the
    #     request body, e.g. an "audience" some providers require),
    #   "oauth_raw_body": "..." (json mode only -- a literal JSON object,
    #     as text; may reference ${VARIABLE} like every other config value
    #     here). Either mode expects a JSON response with at least
    #     "access_token" (and normally "expires_in"; missing/non-numeric
    #     falls back to connections.backends.DEFAULT_OAUTH_TTL).
    config = EncryptedJSONField(default=dict, blank=True)

    # Common to every type (specs/connection.md): a cap on rows/records
    # retrieved per call, and a connect/request timeout.
    max_rows = models.IntegerField(null=True, blank=True, help_text='Blank = unlimited')
    timeout_seconds = models.IntegerField(default=30)

    # type=http, auth_type=oauth only: the current access token and when it
    # expires -- runtime cache state, not user-authored config, same
    # separate-columns convention as e.g. Datastore.last_result/last_run_at.
    # Persisted (not just cached in-memory) so it survives a process restart
    # and is shared across worker processes, and refreshed lazily -- see
    # connections.backends.HttpConnectionBackend.get_oauth_token -- only
    # when something actually tries to use the connection, never by a
    # background poller.
    oauth_token = EncryptedTextField(blank=True)
    oauth_token_expires_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # specs/permissions.md: empty = visible/usable by everyone. Restricting a
    # connection here cascades to any Datastore built on it -- see
    # datastore.roles.apply_cascaded_roles.
    allowed_roles = models.ManyToManyField('accounts.Role', blank=True, related_name='connections')

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.id
