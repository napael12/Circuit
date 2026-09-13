"""specs/permissions.md #2a: a Datastore built on a restricted Connection
automatically inherits that connection's allowed_roles. One-directional --
clearing a connection's roles later does not auto-clear dependent
Datastores, since a Datastore may also carry its own independent
restriction; only "the connection is restricted" is enforced.
"""

from .models import Datastore


def effective_connection(datastore: Datastore):
    """The DataConnection this datastore actually runs against, or None."""
    return datastore.connection


def apply_cascaded_roles(datastore: Datastore) -> None:
    connection = effective_connection(datastore)
    if connection is None:
        return
    role_ids = list(connection.allowed_roles.values_list('id', flat=True))
    if role_ids:
        datastore.allowed_roles.set(role_ids)


def cascade_connection_roles(connection) -> None:
    """Re-applies `connection`'s current allowed_roles onto every Datastore
    built on it -- called when a connection's own roles are edited after
    Datastores already exist.
    """
    role_ids = list(connection.allowed_roles.values_list('id', flat=True))
    if not role_ids:
        return
    for ds in Datastore.objects.filter(connection=connection):
        ds.allowed_roles.set(role_ids)
