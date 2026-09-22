#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Optional first-run admin (skipped when the user already exists).
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py createsuperuser --noinput \
    --username "$DJANGO_SUPERUSER_USERNAME" \
    --email "${DJANGO_SUPERUSER_EMAIL:-admin@example.com}" 2>/dev/null \
    && echo "Created admin user $DJANGO_SUPERUSER_USERNAME" \
    || echo "Admin user $DJANGO_SUPERUSER_USERNAME already exists (or could not be created)"
fi

exec "$@"
