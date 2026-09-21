from django.db import models

from catalog.models import SqlDef
from connections.models import DataConnection


class Datastore(models.Model):
    """A named data-retrieval unit that panel components read from
    (the "Datasource" of specs/datasource_enhancements.md).

    This is the object referenced in the migration spec: controls no
    longer build/send their own SQL or fetch URLs (the legacy "pass
    through" model). Instead they hold a Datastore id and call
    /api/datastores/{id}/data/, and the server decides how/when the
    underlying query or serialized fetch actually runs.

    source_type=query uses a type=sql connections.models.DataConnection (see
    connections.backends for that side of the interface).

    source_type=serialized (specs/serialized-datastore.md) is a general-
    purpose fetch+parse pipeline that superseded the earlier, narrower
    source_type=action/s3/json/file types (each handled exactly one
    connection+format combination; serialized replaced all of them and they
    were removed): it can fetch raw content over HTTP (optionally through a
    type=http connection, see connections.backends' HttpConnectionBackend),
    from an S3 bucket (a type=s3 connection), or a server-local file, then
    parse it with the shared Renderer interface (renderer_type/
    renderer_config).

    ``refresh_mode=on_demand`` executes synchronously on every request.
    ``refresh_mode=scheduled`` is executed by datastore.scheduler on a
    cron schedule; results are cached on ``last_result`` and pushed to
    subscribed clients over the ``datastore_<id>`` websocket group
    (see datastore.consumers) instead of being re-run per request.
    """

    SOURCE_QUERY = 'query'
    SOURCE_SERIALIZED = 'serialized'
    SOURCE_CHOICES = [
        (SOURCE_QUERY, 'SQL query'),
        (SOURCE_SERIALIZED, 'Serialized Data'),
    ]

    # source_type=serialized only (specs/serialized-datastore.md): where the
    # raw content comes from, independent of how it's then parsed
    # (renderer_type/renderer_config, below).
    ACCESS_HTTP = 'http'
    ACCESS_S3 = 's3'
    ACCESS_FILE = 'file'
    ACCESS_CHOICES = [
        (ACCESS_HTTP, 'HTTP request'),
        (ACCESS_S3, 'S3 bucket'),
        (ACCESS_FILE, 'File'),
    ]

    METHOD_GET = 'GET'
    METHOD_POST = 'POST'
    METHOD_CHOICES = [
        (METHOD_GET, 'GET'),
        (METHOD_POST, 'POST'),
    ]

    RENDERER_NONE = 'none'
    RENDERER_JSON = 'json'
    RENDERER_XML = 'xml'
    RENDERER_DELIMITED = 'delimited'
    RENDERER_FIXED_WIDTH = 'fixed_width'
    RENDERER_CHOICES = [
        (RENDERER_NONE, 'None (raw JSON response)'),
        (RENDERER_JSON, 'JSON (JsonPath columns)'),
        (RENDERER_XML, 'XML (XPath columns)'),
        (RENDERER_DELIMITED, 'Delimited text'),
        (RENDERER_FIXED_WIDTH, 'Fixed width'),
    ]

    REFRESH_ON_DEMAND = 'on_demand'
    REFRESH_SCHEDULED = 'scheduled'
    REFRESH_CHOICES = [
        (REFRESH_ON_DEMAND, 'On demand'),
        (REFRESH_SCHEDULED, 'Scheduled (cron)'),
    ]

    # specs/api_datastore.md: whether/how this datastore is reachable through
    # the public, API-key-authenticated pull/push surface (breadboard.
    # public_api). PUSH is only meaningful for source_type=SERIALIZED using
    # the JSON renderer -- enforced in DatastoreSerializer.validate(), not
    # just here.
    API_MODE_NONE = 'none'
    API_MODE_PULL = 'pull'
    API_MODE_PUSH = 'push'
    API_MODE_CHOICES = [
        (API_MODE_NONE, 'Disabled'),
        (API_MODE_PULL, 'Pull'),
        (API_MODE_PUSH, 'Push'),
    ]

    # No separate display-name field -- id doubles as the display name in
    # the manager table, same convention as connections.models.DataConnection.
    id = models.SlugField(primary_key=True, max_length=30)
    source_type = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    # source_type=serialized only: where its raw content is fetched from.
    access_type = models.CharField(max_length=6, choices=ACCESS_CHOICES, blank=True)

    # source_type=query: a type=sql connection. source_type=serialized: a
    # type=http connection (access_type=http, optional -- unset means no
    # authorization) or a type=s3 connection (access_type=s3, required);
    # unused for access_type=file.
    connection = models.ForeignKey(
        DataConnection, null=True, blank=True, on_delete=models.CASCADE,
    )
    sql_def = models.ForeignKey(SqlDef, null=True, blank=True, on_delete=models.SET_NULL)
    inline_sql = models.TextField(blank=True, help_text='Used when sql_def is not set')
    row_limit = models.PositiveIntegerField(null=True, blank=True)
    # Result cache term in seconds (null/0 = caching off). See
    # datastore.cache: entries are keyed by datastore id + the full set of
    # input parameters, and cleared per datastore via its "Clear cache" action.
    cache_seconds = models.PositiveIntegerField(null=True, blank=True)

    # source_type=serialized + access_type=s3: the object key/path within
    # the connection's bucket, used when object_url is blank -- also
    # accepts a full s3:// URI or https S3 URL here (services._parse_s3_url),
    # in which case its own bucket overrides the connection's configured
    # one. Supports ${param} substitution.
    object_key = models.CharField(max_length=500, blank=True)
    # source_type=serialized + access_type=s3 only: an s3:// URI or an s3/
    # virtual-hosted-style https URL (what the AWS console's own "Copy S3
    # URI"/"Object URL" buttons produce), tried instead of connection+
    # object_key when set. Fetched through the connection's own credentials
    # when one is set (services._parse_s3_url extracts bucket+key from the
    # URL itself); falls back to a plain unauthenticated GET when no
    # connection is set or the URL isn't a recognized S3 shape (a public
    # bucket's URL). Supports ${param} substitution.
    object_url = models.CharField(max_length=500, blank=True)

    # source_type=serialized: the collapsible "Body" override
    # (specs/serialized-datastore.md) used for test/troubleshooting -- when
    # non-blank, its content is parsed directly instead of actually
    # fetching from access_type's configured source. Supports ${param}.
    body = models.TextField(blank=True)
    # source_type=serialized + access_type=http: the request URL, used as-is
    # (not appended to the connection's own url -- the http connection here
    # only supplies authorization, not a base path). Supports ${param}.
    data_url = models.CharField(max_length=500, blank=True)

    # source_type=serialized + access_type=http only.
    request_method = models.CharField(max_length=6, choices=METHOD_CHOICES, default=METHOD_GET, blank=True)
    # key -> value query/form params merged into the HTTP request. Supports
    # ${param} substitution in each value.
    request_params = models.JSONField(default=dict, blank=True)
    # Raw request body (JSON/text/XML text), used instead of/alongside
    # request_params for POST. Supports ${param} substitution.
    request_body = models.TextField(blank=True)

    # source_type=serialized + access_type=file only: a directory on the
    # server's own filesystem, and a filename and/or regex selecting one
    # file within it (the first match, alphabetically, when more than one
    # file matches). Both support ${param} substitution.
    file_path = models.CharField(max_length=500, blank=True)
    file_expression = models.CharField(max_length=255, blank=True)

    # Renderer interface (specs/datasource_enhancements.md): how raw content
    # from source_type=serialized is turned into rows/columns -- see
    # datastore.renderers. Unused for source_type=query (SQL already
    # produces rows/columns natively). source_type=serialized only offers
    # json/xml/delimited (specs/serialized-datastore.md's own "Processing
    # Data" list) -- enforced in the UI, not here.
    renderer_type = models.CharField(max_length=15, choices=RENDERER_CHOICES, default=RENDERER_NONE, blank=True)
    renderer_config = models.JSONField(default=dict, blank=True)

    # name -> default value, for any ${param} referenced across this
    # datastore's own metadata (SQL text, object_key, data_url, renderer_config, etc).
    default_params = models.JSONField(default=dict, blank=True)

    # specs/api_datastore.md: PUSH ignores refresh_mode entirely (data
    # arrives via the push API call, not a source re-run) -- renderer_config
    # and row_limit still apply to the pushed payload.
    api_mode = models.CharField(max_length=10, choices=API_MODE_CHOICES, default=API_MODE_NONE, blank=True)

    refresh_mode = models.CharField(
        max_length=10, choices=REFRESH_CHOICES, default=REFRESH_ON_DEMAND
    )
    cron_schedule = models.CharField(
        max_length=60, blank=True,
        help_text='Cron expression (min hour day month day_of_week), used when refresh_mode=scheduled',
    )
    # refresh_mode=scheduled only (see datastore.activity): stop running the
    # cron job once no dashboard/control has had this datastore's websocket
    # open for this many seconds, and resume (with an immediate refresh, not
    # waiting for the next cron tick) the moment one opens it again. 0/blank
    # means "never stop" -- the pre-idle-tracking always-on behavior.
    idle_timeout_seconds = models.PositiveIntegerField(
        default=60, blank=True, null=True,
        help_text='Stop refreshing after this many seconds with no connected viewers (blank/0 = never stop). Scheduled refresh only.',
    )

    # Cache populated by the scheduler for refresh_mode=scheduled stores.
    last_result = models.JSONField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # specs/permissions.md: empty = visible/usable by everyone. Automatically
    # forced to match the effective connection's own allowed_roles whenever
    # that connection is restricted -- see datastore.roles.apply_cascaded_roles.
    allowed_roles = models.ManyToManyField('accounts.Role', blank=True, related_name='datastores')

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.id

    def sql_text(self) -> str:
        return self.sql_def.content if self.sql_def_id else self.inline_sql

    def discover_param_names(self) -> list[str]:
        """${param} names referenced anywhere in this datastore's own metadata
        (specs/datasource_enhancements.md: "parameters can be derived from
        meta data ... in any meta data"), in first-seen order, deduped.
        """
        from breadboard.templating import discover_template_vars

        def strings_in(value):
            if isinstance(value, str):
                yield value
            elif isinstance(value, dict):
                for v in value.values():
                    yield from strings_in(v)
            elif isinstance(value, list):
                for v in value:
                    yield from strings_in(v)

        texts = [
            self.sql_text(), self.object_key, self.object_url, self.body, self.data_url,
            self.request_body, self.file_path, self.file_expression,
        ]
        texts += list(strings_in(self.request_params))
        texts += list(strings_in(self.renderer_config))

        names: list[str] = []
        seen: set[str] = set()
        for text in texts:
            for name in discover_template_vars(text):
                if name not in seen:
                    seen.add(name)
                    names.append(name)
        return names
