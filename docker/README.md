# Docker deployment

Breadboard runs as one container (Django + Daphne serving the API, websockets and the built React
frontend) alongside the sample Postgres database from `../samples/db`.

```
cd docker
cp .env.example .env     # set DJANGO_SECRET_KEY and BREADBOARD_CONNECTION_SECRET_KEY (see the file)
docker compose up --build
```

Open http://localhost:8000 and log in with `DJANGO_SUPERUSER_USERNAME` / `DJANGO_SUPERUSER_PASSWORD`
(default `admin` / `admin` -- change it; the admin is only created on first start).

| Service | Purpose | Data |
|---|---|---|
| `breadboard` | The app, port `BREADBOARD_PORT` (8000) | `breadboard-data` volume mounted at `/data`: `db.sqlite3` and `backups/` |
| `sample-db` | Postgres 17 seeded from `samples/db/samples` | `sample-db-data` volume |

- **Sample DB connection:** create a `sql` connection in Manager with host `sample-db`, port `5432`,
  and the `POSTGRES_*` credentials from `.env` (defaults `postgres` / `postgres`, database `example`).
  The DB is also published on the host at `POSTGRES_PORT`; change it if 5432 is already in use.
  The schema/data are loaded only when the volume is first created -- `docker compose down -v` to reseed.
- **Backups:** in Manager -> Backup set the path to `/data/backups` so backups land in the volume.
- **Keys:** changing `BREADBOARD_CONNECTION_SECRET_KEY` after connections are saved makes their
  stored passwords unreadable.
- **Behind HTTPS/another host:** add the public origin to `DJANGO_CSRF_TRUSTED_ORIGINS`.
- **One app process only:** websockets and the datastore cache use in-process memory, so don't scale
  `breadboard` beyond one replica.
- `docker compose down` keeps the data; `docker compose down -v` deletes it.
