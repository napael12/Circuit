"""API-key auth for the public pull/push surface (breadboard.public_api) --
distinct from the session auth every other endpoint uses (REST_FRAMEWORK's
DEFAULT_AUTHENTICATION_CLASSES), since these are called by external clients
rather than the browser SPA.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import ApiKey, hash_key

API_KEY_HEADER = 'HTTP_X_API_KEY'


class ApiKeyAuthentication(BaseAuthentication):
    """Reads the X-API-Key header; returns (assigned_user, ApiKey) so
    downstream code sees request.user as that key's assigned user and
    request.auth as the ApiKey row itself (used for usage logging).

    Returns None (not raise) when the header is simply absent, so a request
    with no key at all falls through to AnonymousUser -- IsAuthenticated
    then rejects it with the usual 401/403, rather than this class raising
    for what's really "no attempt was made."
    """

    def authenticate(self, request):
        key = request.META.get(API_KEY_HEADER)
        if not key:
            return None
        try:
            api_key = ApiKey.objects.select_related('user').get(key_hash=hash_key(key), is_active=True)
        except ApiKey.DoesNotExist:
            raise AuthenticationFailed('Invalid or inactive API key.')
        if not api_key.user.is_active:
            raise AuthenticationFailed('The user assigned to this API key is inactive.')
        ApiKey.objects.filter(pk=api_key.pk).update(last_used_at=timezone.now())
        return (api_key.user, api_key)
