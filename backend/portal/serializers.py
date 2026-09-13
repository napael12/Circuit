from rest_framework import serializers

from .models import NavTree, Setting


class NavTreeSerializer(serializers.ModelSerializer):
    class Meta:
        model = NavTree
        fields = ['content']


class SettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Setting
        fields = ['id', 'profile', 'key', 'value']
