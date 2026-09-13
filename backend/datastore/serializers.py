from rest_framework import serializers

from . import activity
from .models import Datastore
from .roles import apply_cascaded_roles


class DatastoreSerializer(serializers.ModelSerializer):
    # refresh_mode=scheduled only (see datastore.activity): whether this
    # process currently considers it "running" -- a dashboard/control has
    # its websocket open, or idle_timeout_seconds is 0 ("never stop"). None
    # for refresh_mode=on_demand, where the concept doesn't apply. Not a
    # model field -- computed fresh from in-process state on every read.
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Datastore
        fields = [
            'id', 'name', 'source_type', 'connection', 'sql_def', 'inline_sql',
            'row_limit', 'action', 'object_key', 'body',
            'data_url', 'json_root_path', 'renderer_type',
            'renderer_config', 'default_params', 'api_mode', 'refresh_mode', 'cron_schedule',
            'idle_timeout_seconds', 'is_active',
            'last_run_at', 'last_error', 'created_at', 'updated_at', 'allowed_roles',
        ]
        read_only_fields = ['last_run_at', 'last_error', 'created_at', 'updated_at']

    def get_is_active(self, obj: Datastore) -> bool | None:
        if obj.refresh_mode != Datastore.REFRESH_SCHEDULED:
            return None
        return not activity.is_idle(obj.id, obj.idle_timeout_seconds)

    def validate(self, attrs):
        source_type = attrs.get('source_type', getattr(self.instance, 'source_type', None))
        api_mode = attrs.get('api_mode', getattr(self.instance, 'api_mode', Datastore.API_MODE_NONE))
        if api_mode == Datastore.API_MODE_PUSH and source_type != Datastore.SOURCE_JSON:
            raise serializers.ValidationError({'api_mode': 'Push mode is only available for JSON datastores.'})
        return attrs

    def create(self, validated_data):
        instance = super().create(validated_data)
        apply_cascaded_roles(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        apply_cascaded_roles(instance)
        return instance
