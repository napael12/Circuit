# Sample 'Auth' connections for specs/http-connection.md, one per auth type,
# all pointed at httpbin.org's own auth-testing endpoints as the spec asks.
from django.db import migrations


def create_samples(apps, schema_editor):
    DataConnection = apps.get_model('connections', 'DataConnection')

    samples = [
        dict(
            id='sample-http-basic',
            description='httpbin.org Basic Auth demo (user/passwd)',
            type='http',
            url='https://httpbin.org/basic-auth/user/passwd',
            username='user',
            password='passwd',
            config={'auth_type': 'basic'},
        ),
        dict(
            id='sample-http-apikey',
            description='httpbin.org API Key demo (sent as a header)',
            type='http',
            url='https://httpbin.org/headers',
            config={
                'auth_type': 'api_key',
                'api_key_name': 'X-API-Key',
                'api_key_value': 'sample-key-value',
                'api_key_location': 'header',
            },
        ),
        dict(
            id='sample-http-bearer',
            description='httpbin.org Bearer Token demo',
            type='http',
            url='https://httpbin.org/bearer',
            config={'auth_type': 'bearer', 'token': 'sample-token-value'},
        ),
        dict(
            id='sample-http-digest',
            description='httpbin.org Digest Auth demo (user/passwd, MD5)',
            type='http',
            url='https://httpbin.org/digest-auth/auth/user/passwd/MD5',
            username='user',
            password='passwd',
            config={'auth_type': 'digest', 'digest_algorithm': 'MD5'},
        ),
    ]

    for fields in samples:
        DataConnection.objects.get_or_create(id=fields.pop('id'), defaults=fields)


def remove_samples(apps, schema_editor):
    DataConnection = apps.get_model('connections', 'DataConnection')
    DataConnection.objects.filter(
        id__in=['sample-http-basic', 'sample-http-apikey', 'sample-http-bearer', 'sample-http-digest'],
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('connections', '0006_alter_dataconnection_type'),
    ]

    operations = [
        migrations.RunPython(create_samples, remove_samples),
    ]
