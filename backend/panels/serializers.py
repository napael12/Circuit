from rest_framework import serializers

from .models import Panel, PanelUsage


class PanelSerializer(serializers.ModelSerializer):
    # Declared explicitly (rather than left to ModelSerializer's own
    # unique=True introspection) so blank/absent values normalize to None
    # instead of colliding on '' -- see validate_slug.
    slug = serializers.SlugField(required=False, allow_null=True, allow_blank=True, max_length=60)
    updated_by_username = serializers.CharField(source='updated_by.username', read_only=True, default=None)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    # Not model fields -- annotated onto the queryset by PanelViewSet (most
    # recent PanelUsage row per panel) so the dashboard list can show "last
    # accessed" alongside "last updated" without an extra request per row.
    last_accessed_at = serializers.DateTimeField(read_only=True, default=None)
    last_accessed_by_username = serializers.CharField(read_only=True, default=None)

    class Meta:
        model = Panel
        fields = [
            'id',
            'name',
            'slug',
            'category',
            'subcategory',
            'description',
            'content',
            'created_at',
            'created_by',
            'created_by_username',
            'updated_at',
            'updated_by',
            'updated_by_username',
            'last_accessed_at',
            'last_accessed_by_username',
            'allowed_roles',
        ]
        read_only_fields = ['created_at', 'created_by', 'updated_at', 'updated_by']

    def validate_slug(self, value):
        value = (value or '').strip() or None
        if value is None:
            return None
        qs = Panel.objects.filter(slug=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This slug is already in use.')
        return value


class PanelUsageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PanelUsage
        fields = ['panel', 'accessed_at', 'ip_address', 'user']
