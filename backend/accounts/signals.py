"""specs/permissions.md: "ADMIN == Superuser" as a live, bidirectional
invariant -- whichever side changes (role assignment in the Manager UI, or
is_superuser flipped directly via createsuperuser/shell/Django admin), the
other follows automatically, so Manager access always matches what the
Roles/Users tab shows.
"""

from django.db.models.signals import m2m_changed, post_save
from django.dispatch import receiver

from .models import Role, User


@receiver(m2m_changed, sender=User.roles.through)
def sync_superuser_from_roles(sender, instance, action, reverse, pk_set, **kwargs):
    if action not in ('post_add', 'post_remove', 'post_clear'):
        return
    if not reverse:
        users = [instance]
    elif pk_set:
        users = list(User.objects.filter(pk__in=pk_set))
    else:
        users = []
    for user in users:
        should_be_admin = user.roles.filter(is_admin=True).exists()
        if user.is_superuser != should_be_admin:
            user.is_superuser = should_be_admin
            user.save(update_fields=['is_superuser'])


@receiver(post_save, sender=User)
def sync_roles_from_superuser(sender, instance, **kwargs):
    """Covers is_superuser being set outside the roles UI (createsuperuser,
    shell, Django admin) -- keeps ADMIN role membership matching it. A no-op
    when already in sync, so this doesn't loop with the handler above.
    """
    admin_role = Role.objects.filter(is_admin=True).first()
    if admin_role is None:
        return
    has_role = instance.roles.filter(pk=admin_role.pk).exists()
    if instance.is_superuser and not has_role:
        instance.roles.add(admin_role)
    elif not instance.is_superuser and has_role:
        instance.roles.remove(admin_role)
