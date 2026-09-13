from django.contrib import admin

from .models import Datastore


@admin.register(Datastore)
class DatastoreAdmin(admin.ModelAdmin):
    list_display = ['id', 'source_type', 'refresh_mode', 'cron_schedule', 'last_run_at']
    list_filter = ['source_type', 'refresh_mode']
