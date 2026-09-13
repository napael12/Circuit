from django.db import migrations

# specs/circuit.md: white-label branding -- app name, header icon, favicon --
# stored as ordinary global Settings (profile='*') so they show up in
# Manager -> Settings ready to edit, rather than living only as a
# code-level default (see portal.views.BrandingView, which falls back to
# these same values if a key is ever deleted).
BRANDING_DEFAULTS = {
    'app.name': 'Circuit',
    'app.icon': '/circuit.png',
    'app.favicon': '/circuit.png',
}


def seed_branding_settings(apps, schema_editor):
    Setting = apps.get_model('portal', 'Setting')
    for key, value in BRANDING_DEFAULTS.items():
        Setting.objects.get_or_create(profile='*', key=key, defaults={'value': value})


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('portal', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_branding_settings, noop),
    ]
