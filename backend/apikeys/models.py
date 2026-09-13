"""specs/api_datastore.md: API keys external clients present (via the
X-API-Key header -- see apikeys.authentication) to pull data from / push
data into Datastores on behalf of an assigned user.

Only a salted hash of the secret is ever stored -- the plaintext is
generated once (ApiKey.generate) and shown to the caller exactly once, at
creation, same convention as GitHub/Stripe/etc personal access tokens.
"""
from __future__ import annotations

import hashlib
import secrets

from django.conf import settings
from django.db import models


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class ApiKey(models.Model):
    id = models.SlugField(primary_key=True, max_length=40)
    name = models.CharField(max_length=255)
    # First 11 chars of the plaintext key ("bb_" + 8), shown in listings so a
    # key can be recognized without ever re-displaying the full secret.
    key_prefix = models.CharField(max_length=16, editable=False)
    key_hash = models.CharField(max_length=64, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='api_keys')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @staticmethod
    def generate() -> tuple[str, str]:
        """Returns (plaintext_key, key_hash). The plaintext is never stored --
        the caller must persist key_hash and hand the plaintext back exactly
        once, in the create response."""
        secret = f'bb_{secrets.token_urlsafe(32)}'
        return secret, hash_key(secret)


class ApiKeyUsage(models.Model):
    """One row per pull/push API call -- mirrors panels.models.PanelUsage,
    the pattern specs/api_datastore.md points to ("similar 'Usage' display
    as dashboards").
    """

    MODE_PULL = 'pull'
    MODE_PUSH = 'push'
    MODE_CHOICES = [(MODE_PULL, 'Pull'), (MODE_PUSH, 'Push')]

    api_key = models.ForeignKey(ApiKey, on_delete=models.CASCADE, related_name='usage')
    accessed_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    mode = models.CharField(max_length=4, choices=MODE_CHOICES)
    # Plain field, not a FK: a log entry should survive the datastore it
    # references being deleted later.
    datastore_id = models.CharField(max_length=30, blank=True)
    ok = models.BooleanField(default=True)
    detail = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-accessed_at']
        indexes = [models.Index(fields=['api_key', 'accessed_at'])]
