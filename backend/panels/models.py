from django.conf import settings
from django.db import models


class Panel(models.Model):
    """A saved dashboard definition (was rm_panels in the legacy schema).

    ``content`` is the JSON dashboard document: layout, parameters and
    components. It is opaque to the backend beyond being valid JSON, so it
    round-trips exactly through upload/download, matching the legacy
    "dashboards are shared as JSON files" behaviour. Components reference
    datastore.models.Datastore rows by id for their data, rather than
    embedding raw SQL/connection info as the legacy app did.
    """

    id = models.SlugField(primary_key=True, max_length=30)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=60, unique=True, blank=True, null=True)
    # Free-form grouping/labeling shown in a collapsible "More info" section
    # of the editor, below Name/Slug -- purely descriptive, not referenced by
    # rendering/access logic.
    category = models.CharField(max_length=100, blank=True)
    subcategory = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    content = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )

    # specs/permissions.md: empty = visible/usable by everyone. Non-empty
    # restricts viewing to users with at least one matching role (staff see
    # everything regardless -- see breadboard.access).
    allowed_roles = models.ManyToManyField('accounts.Role', blank=True, related_name='panels')

    class Meta:
        ordering = ['name']
        indexes = [models.Index(fields=['name'])]

    def __str__(self):
        return self.name


class PanelFavorite(models.Model):
    """specs/homepage.md: a user's personal "Favorites" list -- who favorited
    which panel, and when, so the sidebar's Favorites view can list them
    ordered by recency.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='panel_favorites')
    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='favorited_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['user', 'panel']]
        ordering = ['-created_at']


class PanelUsage(models.Model):
    """One row per panel view (was rm_usage in the legacy schema)."""

    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='usage')
    accessed_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        indexes = [models.Index(fields=['panel', 'accessed_at'])]


class PanelUpdate(models.Model):
    """One row per panel save -- the edit-history counterpart to PanelUsage's
    view-history, powering the usage-tracking dialog's "Updates" tab.
    Panel itself only keeps the single latest updated_at/updated_by, so this
    is the only place a full save history is recorded.
    """

    panel = models.ForeignKey(Panel, on_delete=models.CASCADE, related_name='updates')
    updated_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        indexes = [models.Index(fields=['panel', 'updated_at'])]
