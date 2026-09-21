from django.db import migrations

# Version feature: app.version joins the app.name/app.icon/app.favicon
# branding settings seeded in 0002 -- same global (profile='*') Setting row
# so it shows up in Manager -> Settings ready to edit (see
# portal.views.BrandingView, which falls back to this same default if the
# key is ever deleted).
APP_VERSION_DEFAULT = '1.0.0'


def seed_app_version(apps, schema_editor):
    Setting = apps.get_model('portal', 'Setting')
    Setting.objects.get_or_create(profile='*', key='app.version', defaults={'value': APP_VERSION_DEFAULT})


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0002_seed_branding_settings'),
    ]

    operations = [
        migrations.RunPython(seed_app_version, noop),
    ]
