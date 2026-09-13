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
            'id', 'source_type', 'access_type', 'connection', 'sql_def', 'inline_sql',
            'row_limit', 'object_key', 'object_url', 'body',
            'data_url', 'request_method', 'request_params', 'request_body',
            'file_path', 'file_expression', 'renderer_type',
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
        renderer_type = attrs.get('renderer_type', getattr(self.instance, 'renderer_type', Datastore.RENDERER_NONE))
        # Push posts a raw JSON body (breadboard.public_api.PushDatastoreView)
        # straight through the JSON renderer -- only meaningful while this
        # datastore's own renderer is JSON, since an XML/Delimited-configured
        # store has no way to make sense of a pushed JSON payload.
        push_eligible = source_type == Datastore.SOURCE_SERIALIZED and renderer_type == Datastore.RENDERER_JSON
        if api_mode == Datastore.API_MODE_PUSH and not push_eligible:
            raise serializers.ValidationError({
                'api_mode': 'Push mode is only available for Serialized Data datastores using the JSON renderer.',
            })
        return attrs

    def create(self, validated_data):
        instance = super().create(validated_data)
        apply_cascaded_roles(instance)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        apply_cascaded_roles(instance)
        return instance
