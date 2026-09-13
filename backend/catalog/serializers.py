from rest_framework import serializers

from .models import SqlDef


class SqlDefSerializer(serializers.ModelSerializer):
    class Meta:
        model = SqlDef
        fields = ['id', 'description', 'content', 'updated_at', 'updated_by']
        read_only_fields = ['updated_at', 'updated_by']
