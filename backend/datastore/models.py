from django.db import models

from catalog.models import Action, SqlDef
from connections.models import DataConnection


class Datastore(models.Model):
    """A named data-retrieval unit that panel components read from
    (the "Datasource" of specs/datasource_enhancements.md).

    This is the object referenced in the migration spec: controls no
    longer build/send their own SQL or fetch URLs (the legacy "pass
    through" model). Instead they hold a Datastore id and call
    /api/datastores/{id}/data/, and the server decides how/when the
    underlying query, action, or S3 object actually runs.

    Each source_type is built on a matching connections.models.DataConnection
    type (SQL/S3 -- see connections.backends for that side of the interface):
    source_type=query uses a type=sql connection, source_type=action uses a
    type=rest connection (via catalog.models.Action -- see that model's own
    docstring; specs/datastore-streamline.md removed REST as a *creatable*
    connection type, but left this Action-only path alone), source_type=s3
    uses a type=s3 connection directly. specs/datastore-streamline.md also
    removed source_type=file (a File system connection) entirely -- it had
    no remaining path to a valid connection once File was removed.

    ``refresh_mode=on_demand`` executes synchronously on every request.
    ``refresh_mode=scheduled`` is executed by datastore.scheduler on a
    cron schedule; results are cached on ``last_result`` and pushed to
    subscribed clients over the ``datastore_<id>`` websocket group
    (see datastore.consumers) instead of being re-run per request.
    """

    SOURCE_QUERY = 'query'
    SOURCE_ACTION = 'action'
    SOURCE_S3 = 's3'
    SOURCE_JSON = 'json'
    SOURCE_CHOICES = [
        (SOURCE_QUERY, 'SQL query'),
        (SOURCE_ACTION, 'Action (REST)'),
        (SOURCE_S3, 'S3 object'),
        (SOURCE_JSON, 'JSON'),
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
    # public_api). PUSH is only meaningful for source_type=JSON -- enforced
    # in DatastoreSerializer.validate(), not just here.
    API_MODE_NONE = 'none'
    API_MODE_PULL = 'pull'
    API_MODE_PUSH = 'push'
    API_MODE_CHOICES = [
        (API_MODE_NONE, 'Disabled'),
        (API_MODE_PULL, 'Pull'),
        (API_MODE_PUSH, 'Push'),
    ]

    id = models.SlugField(primary_key=True, max_length=30)
    name = models.CharField(max_length=255, blank=True)
    source_type = models.CharField(max_length=10, choices=SOURCE_CHOICES)

    # source_type=query: a type=sql connection. source_type=s3: a type=s3
    # connection used directly. source_type=action: unused (the connection
    # lives on the Action itself).
    connection = models.ForeignKey(
        DataConnection, null=True, blank=True, on_delete=models.CASCADE,
    )
    sql_def = models.ForeignKey(SqlDef, null=True, blank=True, on_delete=models.SET_NULL)
    inline_sql = models.TextField(blank=True, help_text='Used when sql_def is not set')
    row_limit = models.PositiveIntegerField(null=True, blank=True)

    # source_type=action
    action = models.ForeignKey(Action, null=True, blank=True, on_delete=models.CASCADE)

    # source_type=s3: the object key/path within the connection's bucket.
    # Supports ${param} substitution.
    object_key = models.CharField(max_length=500, blank=True)

    # source_type=json (specs/json_datastore.md): the JSON body text, used
    # when connection is unset. Covers both the "hard-coded" and "passed as
    # a parameter" body sources -- the latter is just this field set to a
    # bare ${param}. Supports ${param} substitution.
    body = models.TextField(blank=True)
    # source_type=json + connection set (a type=rest connection): the
    # endpoint to GET the JSON body from, appended to the connection's base
    # url the same way Action.path is (see catalog.actions.run_action).
    # Supports ${param} substitution.
    data_url = models.CharField(max_length=500, blank=True)
    # source_type=json: JsonPath expression (datastore.renderers.render_json)
    # selecting the row node(s) out of the parsed body/response -- blank
    # resolves to "$" (the whole document). Supports ${param} substitution.
    json_root_path = models.CharField(max_length=500, blank=True)

    # Renderer interface (specs/datasource_enhancements.md): how raw content
    # from source_type=action/s3 is turned into rows/columns -- see
    # datastore.renderers. Unused for source_type=query (SQL already
    # produces rows/columns natively).
    renderer_type = models.CharField(max_length=15, choices=RENDERER_CHOICES, default=RENDERER_NONE, blank=True)
    renderer_config = models.JSONField(default=dict, blank=True)

    # name -> default value, for any ${param} referenced across this
    # datastore's own metadata (SQL text, object_key, data_url,
    # renderer_config, or its action's url/path/body/headers).
    default_params = models.JSONField(default=dict, blank=True)

    # specs/api_datastore.md: PUSH ignores refresh_mode entirely (data
    # arrives via the push API call, not a source re-run) -- json_root_path
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

        texts = [self.sql_text(), self.object_key, self.body, self.data_url, self.json_root_path]
        if self.action_id:
            texts += [self.action.url, self.action.path, self.action.request_body]
            texts += list(strings_in(self.action.headers))
        texts += list(strings_in(self.renderer_config))

        names: list[str] = []
        seen: set[str] = set()
        for text in texts:
            for name in discover_template_vars(text):
                if name not in seen:
                    seen.add(name)
                    names.append(name)
        return names
