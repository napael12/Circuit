from django.conf import settings
from django.db import models

from connections.models import DataConnection


class SqlDef(models.Model):
    """A named, saved SQL query (was rm_queries in the legacy schema).

    ``content`` uses SQLAlchemy bound-parameter syntax (``:paramname``)
    rather than the legacy app's naive string substitution, so parameter
    values are always sent to the driver as bind variables.
    """

    id = models.SlugField(primary_key=True, max_length=30)
    description = models.CharField(max_length=255, blank=True)
    content = models.TextField(help_text='SQL text using :param bind variables')

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.id


class Action(models.Model):
    """A configurable outbound HTTP call (was model.Action in the legacy app).

    Either ``connection`` (a type=rest DataConnection) + ``path`` are used
    to build the target URL, or ``url`` is used directly.
    """

    GET = 'GET'
    POST = 'POST'
    METHOD_CHOICES = [(GET, 'GET'), (POST, 'POST')]

    id = models.SlugField(primary_key=True, max_length=30)
    description = models.CharField(max_length=255, blank=True)

    connection = models.ForeignKey(
        DataConnection, null=True, blank=True, on_delete=models.SET_NULL,
        limit_choices_to={'type': DataConnection.TYPE_REST},
    )
    path = models.CharField(max_length=500, blank=True)
    url = models.CharField(max_length=500, blank=True)

    request_type = models.CharField(max_length=4, choices=METHOD_CHOICES, default=GET)
    request_body = models.TextField(blank=True)
    # Extra headers for this action's own requests, layered over (and
    # overriding) its connection's own configured headers -- see
    # connections.backends.RestConnectionBackend.request_kwargs().
    headers = models.JSONField(default=dict, blank=True)
    # Default parameter values, merged under request-supplied values at run time.
    default_params = models.JSONField(default=dict, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='+',
    )

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.id
