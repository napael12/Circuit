from rest_framework import serializers

from .models import ApiKey


class ApiKeySerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True, default=None)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = ApiKey
        fields = [
            'id', 'name', 'key_prefix', 'user', 'user_username', 'is_active',
            'created_at', 'created_by', 'created_by_username', 'last_used_at',
        ]
        read_only_fields = ['id', 'key_prefix', 'created_at', 'created_by', 'last_used_at']
