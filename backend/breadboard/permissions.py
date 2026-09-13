from rest_framework.permissions import SAFE_METHODS, BasePermission

from .access import can_access


class IsAdmin(BasePermission):
    """specs/permissions.md: only the ADMIN role (== is_superuser, kept in
    sync by accounts.signals) may access Portal Management at all -- used
    for endpoints with no read-only carve-out (Users, Roles, usage/KPI
    dialogs).
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class IsAdminOrReadOnly(BasePermission):
    """Any authenticated user can read; only ADMIN (is_superuser) can write.

    Mirrors the legacy app's @PreAuthorize("hasRole('ROLE_ADMIN')") gates on
    the connection/query/panel/settings management endpoints.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_superuser)


class _RoleReadAccess(BasePermission):
    """specs/permissions.md object-level gate: accessing a restricted object
    requires a matching role (admin bypass -- see breadboard.access).

    Deliberately doesn't special-case by HTTP method: several "read" actions
    here (Datastore.data/preview, Panel.download/local_datastore) are POST
    RPC calls, not just SAFE_METHODS, and all of them need this check. Actual
    mutation of the object itself (PUT/PATCH/DELETE, or a custom POST action
    restricted to admins) is already gated earlier, at has_permission, by
    IsAdminOrReadOnly (listed alongside this class on each viewset) -- a
    non-admin mutation attempt never reaches get_object()/this check at all,
    and an admin one always passes can_access() via its own bypass.

    `message` (set per subclass) becomes the 403 body's `detail` via DRF's
    check_object_permissions/permission_denied.
    """

    def has_permission(self, request, view):
        return True

    def has_object_permission(self, request, view, obj):
        return can_access(request.user, obj)


class DashboardRoleAccess(_RoleReadAccess):
    message = "You don't have access to this dashboard."


class DatastoreRoleAccess(_RoleReadAccess):
    message = "You don't have access to this datastore."


class ConnectionRoleAccess(_RoleReadAccess):
    message = "You don't have access to this connection."
