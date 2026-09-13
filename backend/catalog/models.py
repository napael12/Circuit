from django.conf import settings
from django.db import models


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
