import re

from rest_framework import serializers

from .models import DataConnection

# config keys treated as secrets, same as the model-level `password` column:
# redacted on read, and a blank value on write means "keep the saved one".
# 'password' here is type=snowflake's own password (see DataConnection.config's
# doc comment) -- every other type with a password uses the model-level
# column instead, which is already write_only below.
SECRET_CONFIG_KEYS = {'secret_key', 'token', 'api_key_value', 'oauth_client_secret', 'oauth_raw_body', 'password'}

# Matches breadboard.templating's ${name}/${env.name}/${s3.bucket} syntax --
# used below to tell an actual secret apart from a mere *reference* to one
# (a Setting or OS environment variable). A reference isn't itself
# sensitive -- the real value never touched this row -- so there's no reason
# to redact it the way a directly-typed secret is.
_TEMPLATE_VAR_RE = re.compile(r'\$\{[\w.]+\}')


def _is_template_expression(value) -> bool:
    """True if `value` contains a ${...} reference rather than being a literal secret -- see _TEMPLATE_VAR_RE."""
    return bool(value) and bool(_TEMPLATE_VAR_RE.search(str(value)))


class DataConnectionSerializer(serializers.ModelSerializer):
    # Explicit: the model field (connections.fields.EncryptedJSONField) is a
    # TextField under the hood (see that class's docstring), so DRF's
    # model-field auto-mapping would otherwise generate a CharField here.
    config = serializers.JSONField(required=False)

    class Meta:
        model = DataConnection
        fields = [
            'id', 'description', 'type', 'dialect', 'host', 'port', 'database',
            'options', 'url', 'username', 'password', 'config', 'max_rows',
            'timeout_seconds', 'created_at', 'updated_at', 'allowed_roles',
        ]
        extra_kwargs = {'password': {'write_only': True}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        config = dict(data.get('config') or {})
        for key in SECRET_CONFIG_KEYS:
            value = config.get(key)
            if value and not _is_template_expression(value):
                config[key] = ''
        data['config'] = config
        # `password` is write_only above, so the base to_representation()
        # already left it out of `data` entirely -- add it back only when
        # it's a ${...} reference (never a literal credential) so the
        # manager's Password field shows e.g. "${env.DB_PASSWORD}" instead
        # of going blank and prompting "leave blank to keep the saved
        # password" for something that was never a real password to begin
        # with.
        if _is_template_expression(instance.password):
            data['password'] = instance.password
        return data

    def update(self, instance, validated_data):
        if not validated_data.get('password'):
            validated_data.pop('password', None)
        config = validated_data.get('config')
        if config is not None:
            merged = dict(instance.config or {})
            for key, value in config.items():
                if key in SECRET_CONFIG_KEYS and not value:
                    continue  # blank means "keep the saved secret"
                merged[key] = value
            validated_data['config'] = merged
        instance = super().update(instance, validated_data)
        # specs/permissions.md #2a: re-cascade to already-saved Datastores
        # built on this connection whenever its own roles are edited.
        from datastore.roles import cascade_connection_roles

        cascade_connection_roles(instance)
        return instance
