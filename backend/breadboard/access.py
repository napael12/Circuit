"""Shared role-based visibility rules for Dashboards/Datastores/Connections
(specs/permissions.md). Any model with an `allowed_roles` M2M (accounts.Role)
can use these: empty means visible to everyone, otherwise the viewing user
must hold at least one of the listed roles. Admins always see everything --
"admin" in the spec is the ADMIN role, kept equal to is_superuser by
accounts.signals, same flag that already controls Manager access and write
permissions (see breadboard.permissions.IsAdminOrReadOnly).
"""

from django.db.models import Q, QuerySet


def user_role_ids(user) -> set[int]:
    if not user or not user.is_authenticated:
        return set()
    return set(user.roles.values_list('id', flat=True))


def can_access(user, obj) -> bool:
    """Whether `user` may view `obj`, an instance with an `allowed_roles` M2M."""
    if user and user.is_authenticated and user.is_superuser:
        return True
    allowed_ids = set(obj.allowed_roles.values_list('id', flat=True))
    if not allowed_ids:
        return True
    return bool(allowed_ids & user_role_ids(user))


def visible_queryset(queryset: QuerySet, user) -> QuerySet:
    """Narrows `queryset` (a model with `allowed_roles`) to what `user` may see."""
    if user and user.is_authenticated and user.is_superuser:
        return queryset
    role_ids = user_role_ids(user)
    return queryset.filter(Q(allowed_roles__isnull=True) | Q(allowed_roles__in=role_ids)).distinct()
