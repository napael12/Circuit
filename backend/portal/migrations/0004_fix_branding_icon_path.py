from django.db import migrations

# 0002_seed_branding_settings originally seeded app.icon/app.favicon as plain
# '/circuit.png'. The built frontend is served under /static/ (see
# breadboard/settings.py STATIC_URL, frontend/vite.config.ts base), so that
# path 404s on the monosite build and falls through to the SPA catch-all
# route, which serves index.html instead of the image. Repoint existing rows
# still holding that stale default; leave any admin-customized value alone.
OLD_VALUE = '/circuit.png'
NEW_VALUE = '/static/circuit.png'
KEYS = ('app.icon', 'app.favicon')


def fix_icon_path(apps, schema_editor):
    Setting = apps.get_model('portal', 'Setting')
    Setting.objects.filter(profile='*', key__in=KEYS, value=OLD_VALUE).update(value=NEW_VALUE)


def revert_icon_path(apps, schema_editor):
    Setting = apps.get_model('portal', 'Setting')
    Setting.objects.filter(profile='*', key__in=KEYS, value=NEW_VALUE).update(value=OLD_VALUE)


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0003_seed_app_version'),
    ]

    operations = [
        migrations.RunPython(fix_icon_path, revert_icon_path),
    ]
