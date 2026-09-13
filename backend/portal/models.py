from django.db import models


def default_nav_tree():
    return {'id': '1', 'text': 'home', 'item': []}


class NavTree(models.Model):
    """The portal navigation tree (was rm_tree in the legacy schema).

    Stored as a single JSON blob, same as the legacy app -- there is
    exactly one row (id=1).
    """

    content = models.JSONField(default=default_nav_tree)

    def __str__(self):
        return 'nav-tree'


class Setting(models.Model):
    """A key/value setting, optionally scoped to a profile (was rm_settings).

    ``profile='*'`` is the global default; other profile values (e.g. an
    environment name) override it. Mirrors the legacy app's
    SettingDao.getSettings() layering.
    """

    profile = models.CharField(max_length=30, default='*')
    key = models.CharField(max_length=120)
    value = models.CharField(max_length=500, blank=True)

    class Meta:
        unique_together = [('profile', 'key')]
        ordering = ['profile', 'key']

    def __str__(self):
        return f'{self.profile}:{self.key}'
