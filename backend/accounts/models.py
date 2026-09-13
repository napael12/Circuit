from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.Model):
    """An internal role (was rm_roles in the legacy schema)."""

    name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255, blank=True)
    # The one built-in "ADMIN" role (specs/permissions.md): full Manager
    # access, equivalent to is_superuser, and the only role that can assign
    # roles to other users. Kept in sync with User.is_superuser by a signal
    # (accounts.signals) rather than matched by name, so renaming this role
    # in the Roles tab can't silently break admin access. Read-only via the
    # API (see RoleSerializer); RoleViewSet refuses to delete this row.
    is_admin = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class User(AbstractUser):
    """The app's own user model (was rm_username + LDAP/Azure AD identities
    in the legacy app; here just Django's session auth, kept under our own
    app instead of django.contrib.auth so we own the schema).

    Subclasses AbstractUser rather than replacing the auth machinery
    entirely -- password hashing, sessions and login all keep working
    exactly as before, just backed by our own table.
    """

    roles = models.ManyToManyField(Role, related_name='users', blank=True)
