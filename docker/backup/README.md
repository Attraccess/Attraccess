# Attraccess backup sidecar

Scheduled [restic](https://restic.net) backups for the balena stack (`docker-compose.balena.yml`, service `backup`).
Each run dumps the PostgreSQL database (`pg_dump -Fc`), then uploads the dump and the volumes of the stack
(proxy data and certificates, `attraccess-storage`, webhook-site, rabbitmq, zigbee2mqtt, prometheus, grafana,
config-ui) to an encrypted restic repository and prunes old snapshots.

On start (`run`) the container checks only its settings, not the repository, so it also starts while the target cannot
be reached (internet down at boot). Then it writes `enabled` to `/var/lib/backup-status/status` (volume
`backup-status`). The `attraccess` service of the balena stack mounts that volume read-only and only starts once the
file exists. Without `BACKUP_REPOSITORY`, `BACKUP_PASSWORD` or `DATABASE_URL`, or with an invalid `BACKUP_SCHEDULE` or
`BACKUP_MAX_AGE_HOURS`, the container exits with an error (and is restarted): a device without backups does not go
unnoticed. `BACKUP_DISABLED=true` switches backups off on purpose: the container logs one warning, writes `disabled`
and waits. The status file is removed when the container starts and when it stops.

Problems with the target show up in the runs. The first run initialises the repository (`restic init`, also creates a
missing bucket). A run fails when the repository cannot be opened (wrong password, address or credentials) or does not
answer within `BACKUP_CONNECT_TIMEOUT_SECONDS`. Files that vanish while they are read (restic exit code 3, e.g. journals
of running services) are skipped with a warning; the run still succeeds.

## Metrics and alerts

Every start and every run writes `backup.prom` next to the status file (Prometheus textfile format, readable by
node-exporter's textfile collector, which the balena stack points at the `backup-status` volume). The values behind it
live in `BACKUP_STATE_DIR`, so they survive restarts.

| Metric                                     | Meaning                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `backup_configured`                        | 1 set up and scheduled, 0 refused to start (settings missing or invalid)     |
| `backup_disabled`                          | 1 with `BACKUP_DISABLED=true` (then `backup_configured` is absent)           |
| `backup_max_age_seconds`                   | `BACKUP_MAX_AGE_HOURS` in seconds                                            |
| `backup_scheduler_start_timestamp_seconds` | start of the scheduler (the reference for `BackupTooOld` before any success) |
| `backup_last_run_timestamp_seconds`        | end of the last run                                                          |
| `backup_last_run_success`                  | 1 the last run succeeded, 0 it failed                                        |
| `backup_last_success_timestamp_seconds`    | end of the last successful run                                               |

The Grafana rules `BackupNotConfigured`, `BackupFailed`, `BackupTooOld` and `BackupsDisabled`
(`monitoring/grafana/provisioning/alerting/rules.yaml`) read them; `apps/api/src/metrics/alerting/backup-alerts.alerting.spec.ts`
tests them against real Prometheus and Grafana (`pnpm nx run api:test-alerting`; on rootless Docker set
`ALERTING_HOST_GATEWAY` to the host's LAN address).

## Settings (environment, e.g. balena device variables)

Use one restic repository per installation. Set `BACKUP_REPOSITORY` as a **device** variable (or give each device its
own path in the repository), not as a fleet variable: a fleet variable gives every device of the fleet the same
repository. If several installations must share one repository, give each its own `BACKUP_HOST`; otherwise their
retention (`forget --prune`) and `restore latest` mix up the snapshots of different installations.

| Variable                                                 | Default                  | Meaning                                                                     |
| -------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                      | – (required)             | restic repository, e.g. `s3:s3.amazonaws.com/bucket/attraccess`, `sftp:…`   |
| `BACKUP_PASSWORD`                                        | –                        | encrypts the repository. Required, and lost together with it if forgotten   |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …  | –                        | credentials of the target, passed to restic unchanged                       |
| `BACKUP_SCHEDULE`                                        | `0 3 * * *`              | 5-field cron expression (container time zone, `TZ`)                         |
| `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` / `…_MONTHLY` | `7`/`4`/`6`              | retention                                                                   |
| `BACKUP_HOST`                                            | `attraccess`             | restic host name: backup, retention, `snapshots` and `restore` only use it  |
| `DATABASE_URL` (or `BACKUP_DATABASE_URL`)                | from stack               | database to dump and restore (`BACKUP_DATABASE_URL` wins when both are set) |
| `BACKUP_PG_WAIT_SECONDS`                                 | `120`                    | how long a run waits for PostgreSQL before it fails                         |
| `BACKUP_DISABLED`                                        | –                        | `true`/`1`/`yes`: no backups on purpose; reports `disabled`, does not fail  |
| `BACKUP_FORCE`                                           | –                        | `true` makes every `restore` behave as `restore --force`                    |
| `BACKUP_STATE_DIR`                                       | `/var/lib/backup`        | scratch space: dump during a run, restic cache, lock, metric values         |
| `BACKUP_DATA_DIR`                                        | `/external-storage`      | the volumes to back up and restore (mounted below it)                       |
| `BACKUP_STATUS_DIR`                                      | `/var/lib/backup-status` | `status` file (`enabled`/`disabled`) the attraccess service waits for       |
| `BACKUP_MAX_AGE_HOURS`                                   | `30`                     | `BackupTooOld` fires when the last success is older (whole hours)           |
| `BACKUP_CONNECT_TIMEOUT_SECONDS`                         | `120`                    | a run fails when the target does not answer within this time                |

The password in the database URL may be percent-encoded, in the user info (`user:password@host`) or as a `password=`
query parameter. The tools get the URL without the password on their command line (visible in `ps`); the password goes
to libpq through `PGPASSWORD`.

A run logs `backup started`, then either `backup SUCCEEDED in …s` or `BACKUP FAILED`, and updates `backup.prom` (see
[Metrics and alerts](#metrics-and-alerts)). Earlier versions wrote only the last success, to
`/var/lib/backup/backup_last_success_timestamp_seconds.prom`; the first start of this version carries that value over
and removes the file.

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

Restoring onto a new device: bring up the stack with the same `BACKUP_REPOSITORY`, `BACKUP_PASSWORD` and `BACKUP_HOST`
(if you set one), stop the
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
