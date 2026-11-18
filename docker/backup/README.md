# Attraccess backup sidecar

Scheduled [restic](https://restic.net) backups for the balena stack (`docker-compose.balena.yml`, service `backup`).
Each run dumps the PostgreSQL database (`pg_dump -Fc`), then uploads the dump and the volumes of the stack
(proxy data and certificates, `attraccess-storage`, webhook-site, rabbitmq, zigbee2mqtt, prometheus, grafana,
config-ui) to an encrypted restic repository and prunes old snapshots.

Without `BACKUP_REPOSITORY` the container logs one warning and idles: nothing is backed up.

## Settings (environment, e.g. balena device/fleet variables)

| Variable                                                 | Default     | Meaning                                                                   |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                      | – (off)     | restic repository, e.g. `s3:s3.amazonaws.com/bucket/attraccess`, `sftp:…` |
| `BACKUP_PASSWORD`                                        | –           | encrypts the repository. Required, and lost together with it if forgotten |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …  | –           | credentials of the target, passed to restic unchanged                     |
| `BACKUP_SCHEDULE`                                        | `0 3 * * *` | 5-field cron expression (container time zone, `TZ`)                       |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` / `…_MONTHLY` | `7`/`4`/`6` | retention                                                                 |
| `DATABASE_URL` (or `BACKUP_DATABASE_URL`)                | from stack  | database to dump and restore                                              |
| `BACKUP_PG_WAIT_SECONDS`                                 | `120`       | how long a run waits for PostgreSQL before it fails                       |

A run logs `backup started`, then either `backup SUCCEEDED in …s` or `BACKUP FAILED`. After a success the file
`/var/lib/backup/backup_last_success_timestamp_seconds.prom` holds `backup_last_success_timestamp_seconds <unix time>`
(Prometheus textfile format).

## Commands

```sh
attraccess-backup backup                       # one backup now
attraccess-backup restore [--force] [snapshot] # snapshot id or `latest` (default)
```

On a balena device: `balena-engine exec -it <backup container> attraccess-backup restore`; elsewhere
`docker compose run --rm backup restore`.

`restore` writes the volumes back to their original place and loads the dump with `pg_restore` into the database of
`DATABASE_URL`. It refuses a database that already has tables unless `--force` (which replaces its contents).
Stop the other services first (everything except `postgres` and `backup`), restore, then start them again.
Restoring onto a new device: bring up the stack, set the same `BACKUP_*` variables, stop the other services, restore.

## Tests

`test/backup-restore.test.sh` runs a full backup and restore round trip against a local restic directory and a real
PostgreSQL (`TEST_DATABASE_URL`, an admin connection). Run it inside the image so the tools match production:

```sh
docker build -t attraccess-backup docker/backup
docker run --rm --network host -e TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  -v "$PWD/docker/backup/test:/test:ro" --entrypoint sh attraccess-backup /test/backup-restore.test.sh
```
