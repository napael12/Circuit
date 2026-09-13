from django.contrib import admin

from .models import SqlDef


@admin.register(SqlDef)
class SqlDefAdmin(admin.ModelAdmin):
    list_display = ['id', 'description', 'updated_at', 'updated_by']
