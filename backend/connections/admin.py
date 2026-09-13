from django.contrib import admin

from .models import DataConnection


@admin.register(DataConnection)
class DataConnectionAdmin(admin.ModelAdmin):
    list_display = ['id', 'type', 'dialect', 'host', 'database', 'max_rows', 'timeout_seconds']
    list_filter = ['type']
    # `config` holds nested per-type JSON (and secrets) as a single encrypted
    # text blob -- admin's default Textarea widget would round-trip it as a
    # Python dict repr, not JSON, corrupting it on save. Edit via the manager
    # UI's connection form instead, which knows the per-type shape.
    readonly_fields = ['config']
