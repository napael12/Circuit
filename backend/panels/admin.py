from django.contrib import admin

from .models import Panel, PanelFavorite, PanelUpdate, PanelUsage


@admin.register(Panel)
class PanelAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'updated_at', 'updated_by']
    search_fields = ['id', 'name']


@admin.register(PanelUsage)
class PanelUsageAdmin(admin.ModelAdmin):
    list_display = ['panel', 'accessed_at', 'user', 'ip_address']
    list_filter = ['panel']


@admin.register(PanelUpdate)
class PanelUpdateAdmin(admin.ModelAdmin):
    list_display = ['panel', 'updated_at', 'user']
    list_filter = ['panel']


@admin.register(PanelFavorite)
class PanelFavoriteAdmin(admin.ModelAdmin):
    list_display = ['user', 'panel', 'created_at']
    list_filter = ['user']
