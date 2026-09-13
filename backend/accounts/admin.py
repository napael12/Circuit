from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Role, User


@admin.register(User)
class BreadboardUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + ((
        'Roles',
        {'fields': ('roles',)},
    ),)
    filter_horizontal = UserAdmin.filter_horizontal + ('roles',)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'description']
