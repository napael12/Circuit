import json

from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models


def _fernet() -> Fernet:
    return Fernet(settings.BREADBOARD_CONNECTION_SECRET_KEY)


class EncryptedTextField(models.TextField):
    """Stores its value encrypted at rest using a Fernet key.

    Replaces the legacy app's plaintext rm_connections.PASSWORD column.
    """

    def get_prep_value(self, value):
        if value is None or value == '':
            return value
        return _fernet().encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value:
            return value
        return _fernet().decrypt(value.encode()).decode()


class EncryptedJSONField(models.TextField):
    """A dict/list value, JSON-serialized then encrypted at rest using a Fernet key.

    Holds per-type connection config (REST auth details, S3 keys, file
    paths, ...), some of which is as sensitive as the password field above.
    Deliberately a plain TextField rather than JSONField: JSONField's own
    (de)serialization happens in the database adapter, past the point
    get_prep_value/from_db_value can intercept it to encrypt/decrypt, so this
    field does the JSON encoding itself instead. The API still sees a plain
    JSON object -- see DataConnectionSerializer, which declares `config` as
    an explicit serializers.JSONField() rather than relying on DRF's
    model-field auto-mapping.
    """

    def get_prep_value(self, value):
        if not value:
            return ''
        return _fernet().encrypt(json.dumps(value).encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value:
            return {}
        return json.loads(_fernet().decrypt(value.encode()).decode())

    def to_python(self, value):
        if value is None or isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(_fernet().decrypt(value.encode()).decode())
        except (ValueError, UnicodeDecodeError):
            return {}
