from django.contrib import admin

from .models import Action, SqlDef


@admin.register(SqlDef)
class SqlDefAdmin(admin.ModelAdmin):
    list_display = ['id', 'description', 'updated_at', 'updated_by']


@admin.register(Action)
class ActionAdmin(admin.ModelAdmin):
    list_display = ['id', 'description', 'connection', 'request_type', 'updated_at']
