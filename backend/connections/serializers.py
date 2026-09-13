from rest_framework import serializers

from .models import DataConnection

# config keys treated as secrets, same as the model-level `password` column:
# redacted on read, and a blank value on write means "keep the saved one".
SECRET_CONFIG_KEYS = {'secret_key', 'token', 'api_key_value'}


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
            if config.get(key):
                config[key] = ''
        data['config'] = config
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
