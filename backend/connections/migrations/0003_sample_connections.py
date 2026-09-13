# Sample connections for specs/connection.md: one publicly reachable,
# credential-free example per connection type (except MS SQL, where no such
# public instance is known -- that one is left as a template for real
# credentials), so the manager UI has something to click "Test" on out of
# the box.
import tempfile

from django.db import migrations


def create_samples(apps, schema_editor):
    DataConnection = apps.get_model('connections', 'DataConnection')

    samples = [
        dict(
            id='sample-postgres',
            description='EBI public read-only Postgres demo (Rfam/RNAcentral tutorials)',
            type='sql',
            dialect='postgresql+psycopg2',
            host='hh-pgsql-public.ebi.ac.uk',
            port=5432,
            database='pfmegrnargs',
            username='reader',
            password='NWDMCE5xdipIjRrp',
            config={'test_query': 'SELECT 1'},
        ),
        dict(
            id='sample-mssql',
            description='MS SQL Server template -- fill in host/database/credentials before use',
            type='sql',
            dialect='mssql+pyodbc',
            options={'driver': 'ODBC Driver 17 for SQL Server'},
        ),
        dict(
            id='sample-rest',
            description='JSONPlaceholder -- public fake REST API for testing, no auth',
            type='rest',
            url='https://jsonplaceholder.typicode.com',
            config={'method': 'GET', 'auth_type': 'none'},
        ),
        dict(
            id='sample-s3',
            description='NOAA GOES-16 public Open Data bucket, anonymous access',
            type='s3',
            config={'region': 'us-east-1', 'bucket': 'noaa-goes16'},
        ),
        dict(
            id='sample-file',
            description='Local temp directory (demonstrates the File connection type)',
            type='file',
            config={'file_path': tempfile.gettempdir()},
        ),
    ]

    for fields in samples:
        DataConnection.objects.get_or_create(id=fields.pop('id'), defaults=fields)


def remove_samples(apps, schema_editor):
    DataConnection = apps.get_model('connections', 'DataConnection')
    DataConnection.objects.filter(
        id__in=['sample-postgres', 'sample-mssql', 'sample-rest', 'sample-s3', 'sample-file'],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('connections', '0002_dataconnection_config_dataconnection_max_rows_and_more'),
    ]

    operations = [
        migrations.RunPython(create_samples, remove_samples),
    ]
