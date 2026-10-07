# Docker deployment

Breadboard runs as one container (Django + Daphne serving the API, websockets and the built React
frontend). A sample SQLite database (`examples.db`, seeded from `../samples/db`) ships inside the
image.

```
cd docker
cp .env.example .env     # set DJANGO_SECRET_KEY and BREADBOARD_CONNECTION_SECRET_KEY (see the file)
docker compose up --build
```

Open http://localhost:8000 and log in with `DJANGO_SUPERUSER_USERNAME` / `DJANGO_SUPERUSER_PASSWORD`
(default `admin` / `admin` -- change it; the admin is only created on first start).

| Service | Purpose | Data |
|---|---|---|
| `breadboard` | The app, port `BREADBOARD_PORT` (8000) | `breadboard-data` volume mounted at `/data`: `db.sqlite3`, `backups/`, and `examples.db` |

- **Sample DB connection:** create a `sql` connection in Manager with dialect `sqlite` and either
  database path `/data/examples.db`, or URL `sqlite:////data/examples.db` (4 slashes -- it's an
  absolute path). No host/port/credentials needed.
  The file is copied into the volume only when the volume is first created -- `docker compose down -v`
  to pick up a rebuilt image's copy of `examples.db`.
- **Backups:** in Manager -> Backup set the path to `/data/backups` so backups land in the volume.
- **Keys:** changing `BREADBOARD_CONNECTION_SECRET_KEY` after connections are saved makes their
  stored passwords unreadable.
- **Behind HTTPS/another host:** add the public origin to `DJANGO_CSRF_TRUSTED_ORIGINS`.
- **One app process only:** websockets and the datastore cache use in-process memory, so don't scale
  `breadboard` beyond one replica.
- `docker compose down` keeps the data; `docker compose down -v` deletes it.
