from django.contrib import admin

from .models import NavTree, Setting


@admin.register(NavTree)
class NavTreeAdmin(admin.ModelAdmin):
    list_display = ['id']


@admin.register(Setting)
class SettingAdmin(admin.ModelAdmin):
    list_display = ['profile', 'key', 'value']
    list_filter = ['profile']
