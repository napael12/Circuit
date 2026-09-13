from rest_framework import serializers

from .models import Action, SqlDef


class SqlDefSerializer(serializers.ModelSerializer):
    class Meta:
        model = SqlDef
        fields = ['id', 'description', 'content', 'updated_at', 'updated_by']
        read_only_fields = ['updated_at', 'updated_by']


class ActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Action
        fields = [
            'id', 'description', 'connection', 'path', 'url', 'request_type',
            'request_body', 'headers', 'default_params', 'updated_at', 'updated_by',
        ]
        read_only_fields = ['updated_at', 'updated_by']
