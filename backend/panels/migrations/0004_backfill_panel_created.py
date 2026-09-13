from django.db import migrations


def backfill_created(apps, schema_editor):
    """0003 added created_at/created_by with a one-time default (today's
    date, blank user) for rows that already existed -- wrong for any
    dashboard saved before that migration ran. There's no real edit history
    to recover the true creation date from, so this uses the closest proxy
    available: PanelUsage (specs/panel_tracking.md) logs a row on every GET
    of a panel, including a staff member's first open of a brand-new
    dashboard, so its earliest row per panel is the first record of that
    dashboard existing. Falls back to updated_at/updated_by (also just a
    single current snapshot, but still earlier/better than the migration's
    default) when a panel has no usage history at all.
    """
    Panel = apps.get_model('panels', 'Panel')
    PanelUsage = apps.get_model('panels', 'PanelUsage')

    for panel in Panel.objects.filter(created_by__isnull=True):
        first_usage = PanelUsage.objects.filter(panel=panel).order_by('accessed_at').first()
        if first_usage is not None and first_usage.accessed_at < panel.created_at:
            panel.created_at = first_usage.accessed_at
            panel.created_by = first_usage.user
        else:
            panel.created_at = panel.updated_at
            panel.created_by = panel.updated_by
        panel.save(update_fields=['created_at', 'created_by'])


class Migration(migrations.Migration):

    dependencies = [
        ('panels', '0003_panel_created_at_panel_created_by'),
    ]

    operations = [
        migrations.RunPython(backfill_created, migrations.RunPython.noop),
    ]
