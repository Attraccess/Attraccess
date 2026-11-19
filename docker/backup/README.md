# Attraccess backup sidecar

Scheduled [restic](https://restic.net) backups for the balena stack (`docker-compose.balena.yml`, service `backup`).
Each run dumps the PostgreSQL database (`pg_dump -Fc`), then uploads the dump and the volumes of the stack
(proxy data and certificates, `attraccess-storage`, webhook-site, rabbitmq, zigbee2mqtt, prometheus, grafana,
config-ui) to an encrypted restic repository and prunes old snapshots.

Without `BACKUP_REPOSITORY` the container logs one warning and idles: nothing is backed up.

## Settings (environment, e.g. balena device/fleet variables)

| Variable                                                 | Default             | Meaning                                                                     |
| -------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                      | – (off)             | restic repository, e.g. `s3:s3.amazonaws.com/bucket/attraccess`, `sftp:…`   |
| `BACKUP_PASSWORD`                                        | –                   | encrypts the repository. Required, and lost together with it if forgotten   |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …  | –                   | credentials of the target, passed to restic unchanged                       |
| `BACKUP_SCHEDULE`                                        | `0 3 * * *`         | 5-field cron expression (container time zone, `TZ`)                         |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` / `…_MONTHLY` | `7`/`4`/`6`         | retention                                                                   |
| `DATABASE_URL` (or `BACKUP_DATABASE_URL`)                | from stack          | database to dump and restore (`BACKUP_DATABASE_URL` wins when both are set) |
| `BACKUP_PG_WAIT_SECONDS`                                 | `120`               | how long a run waits for PostgreSQL before it fails                         |
| `BACKUP_FORCE`                                           | –                   | `true` makes every `restore` behave as `restore --force`                    |
| `BACKUP_STATE_DIR`                                       | `/var/lib/backup`   | scratch space: dump during a run, restic cache, lock, metric file           |
| `BACKUP_DATA_DIR`                                        | `/external-storage` | the volumes to back up and restore (mounted below it)                       |

The password in the database URL may be percent-encoded. The tools get the URL without the password on their command
line (visible in `ps`); the password goes to libpq through `PGPASSWORD`.

A run logs `backup started`, then either `backup SUCCEEDED in …s` or `BACKUP FAILED`. After a success the file
`/var/lib/backup/backup_last_success_timestamp_seconds.prom` holds `backup_last_success_timestamp_seconds <unix time>`
(Prometheus textfile format). Nothing reads it by default: to alert on a missing backup, mount the `backup-state`
volume read-only into a node-exporter with `--collector.textfile.directory` and add an alert rule.

Files are created with `umask 077`. The plaintext dump exists only while a run is busy: it is deleted when the run
ends (also when it fails); a restore deletes its copy of the dump as well.

`pg_dump` holds share locks on every table until the dump is complete. Changes to the schema during that time (plugin
installs and upgrades, Attraccess updates) wait and can fail with a lock timeout: retry after the backup.

## Commands

```sh
attraccess-backup backup                       # one backup now
attraccess-backup snapshots                    # list the snapshots (id, time, paths)
attraccess-backup restore [--force] [snapshot] # snapshot id or `latest` (default)
attraccess-backup restic <args>                # any restic command with the repository settings, e.g. `restic check`
```

On a balena device: `balena-engine exec -it <backup container> attraccess-backup restore`; elsewhere
`docker compose run --rm backup restore`.

`restore` first loads the dump with `pg_restore` into the database of `DATABASE_URL`, then writes the volumes back to
their original place. If the database restore fails, the volumes are not touched. It refuses a database that already
has tables unless `--force` (which replaces its contents). Stop the other services first (everything except
`postgres` and `backup`), restore, then start them again.

Name the snapshot explicitly (`attraccess-backup snapshots` lists them) rather than relying on `latest`: a backup of a
freshly set-up, empty stack is also a snapshot, and it becomes `latest`.

Restoring onto a new device: bring up the stack with the same `BACKUP_REPOSITORY` and `BACKUP_PASSWORD`, stop the
other services and run `restore --force <snapshot-id>` (the first start already created the empty tables). Do it
**before** the first scheduled backup of the new device (by default at 03:00); if one already ran, pick the snapshot
of the old device from `attraccess-backup snapshots` by its time.

## Tests

`test/backup-restore.test.sh` runs a full backup and restore round trip against a local restic directory and a real
PostgreSQL (`TEST_DATABASE_URL`, an admin connection). It also checks that the password stays off the command lines,
that no plaintext dump is left behind and that a failed database restore leaves the volumes alone. CI runs it (job
`backup-sidecar` in `.github/workflows/pull-requests.yml`) when `docker/backup` changes. Run it inside the image so the
tools match production:

```sh
docker build -t attraccess-backup docker/backup
docker run --rm --network host -e TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  -v "$PWD/docker/backup/test:/test:ro" --entrypoint sh attraccess-backup /test/backup-restore.test.sh
```
