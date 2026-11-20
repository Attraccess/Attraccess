# Backup & Restore

<!-- llms-description: Explains what Attraccess data to back up (the PostgreSQL database and the storage volume), how to back it up with the balena sidecar, Coolify or pg_dump, and how to restore it. -->

Attraccess keeps its data in two places. A backup must contain both, taken at about the same time:

| What                                   | Where                                                         | Contents                                                                                     |
| -------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **PostgreSQL database** (`attraccess`) | The `postgres` service of your stack (volume `postgres-data`) | All settings, users, resources, usage, billing, audit log, **and the tables of all plugins** |
| **Storage directory** (`/app/storage`) | The `attraccess-storage` volume                               | `cdn/` (uploaded files), `plugins/` (installed plugins), `cache/` (can be regenerated)       |

> [!NOTE]
> The database is the most important part. Without it, all configuration and data is lost. A copy of the data directory of a running PostgreSQL is **not** a valid backup: use `pg_dump`, as described below.

Also keep your `.env` file (it holds `AUTH_SESSION_SECRET` and the database password) and the data of other services in your stack (for example Mosquitto or Grafana volumes) somewhere safe. They are not part of the storage volume.

## What a Backup Contains and Requires

The database holds the core data **and the tables of all plugins** together with their migration state (the core `migrations` table and one migrations table per plugin). A `pg_dump` therefore is one consistent unit.

- Restore the database together with the `plugins/` folder, and start the Attraccess version the backup was made with or a newer one. Newer versions upgrade the database on start; an older version cannot open a database that a newer one has migrated.
- Balances, price snapshots and meter values are stored as exact values and come back unchanged.
- Keep `AUTH_SESSION_SECRET` from the time of the backup. It protects the stored reader-pairing keys.
- Restoring a 1.x **SQLite** backup (`attraccess.sqlite`) works through the automatic transfer, see [Updating](installation/updating.md#moving-from-sqlite-to-postgresql).

The same requirements (stable identifiers, timestamps, exact values, plugin data and migration state) define the [export and import contract](developer/adding-a-database-backend.md) for the SQLite transfer.

## Docker Compose and other plain setups

### Manual backup

Dump the database in PostgreSQL's custom format (compressed, restorable with `pg_restore`) and archive the storage volume. Adjust the service name, user and database to your Compose file; the shipped files use the database `attraccess`.

```bash
mkdir -p backups

# Database (consistent, while Attraccess keeps running)
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" attraccess' \
  > backups/attraccess-db-$(date +%Y%m%d).dump

# Storage volume (uploads, plugins)
docker run --rm \
  -v attraccess-storage:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/attraccess-storage-$(date +%Y%m%d).tar.gz -C /data .
```

`pg_dump` takes a consistent snapshot without stopping Attraccess. For the best match between database and files, run both commands directly after each other, or stop the `attraccess` service while you back up.

> [!NOTE]
> While `pg_dump` runs it holds a share lock on every table until the dump is complete. Normal use of Attraccess continues, but schema changes wait: installing or upgrading a plugin, or updating Attraccess, during a backup can fail with a lock timeout. Retry once the backup has finished, and schedule automatic backups (including the balena sidecar and Coolify backups) outside the times when you install plugins or update.

### Automated backup

Create a cron job script at `/etc/cron.daily/attraccess-backup`:

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/path/to/backups
DAYS_TO_KEEP=30
cd /path/to/attraccess   # the directory with your docker-compose.yml

docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" attraccess' \
  > $BACKUP_DIR/attraccess-db-$(date +%Y%m%d).dump

docker run --rm \
  -v attraccess-storage:/data:ro \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/attraccess-storage-$(date +%Y%m%d).tar.gz -C /data .

# Delete old backups
find $BACKUP_DIR -name "attraccess-*" -mtime +$DAYS_TO_KEEP -delete
```

### Restoring

```bash
# 1. Stop Attraccess (keep postgres running)
docker compose stop attraccess

# 2. Replace the database with the dump
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists attraccess && createdb -U "$POSTGRES_USER" attraccess'
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d attraccess --no-owner' \
  < backups/attraccess-db-DATE.dump

# 3. Restore the storage volume
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/attraccess-storage-DATE.tar.gz -C /data"

# 4. Start Attraccess
docker compose start attraccess
```

> [!WARNING]
> Restoring overwrites all current data. Create a backup of the current state first. `dropdb` fails while other sessions are connected; stop every service that uses the database first.

## balena: restic sidecar

The balena stack (`docker-compose.balena.yml`) contains a `backup` service. Every night it dumps the PostgreSQL database (`pg_dump -Fc`), then uploads the dump together with the volumes of the stack (proxy data and certificates, `attraccess-storage`, webhook-site, RabbitMQ, zigbee2mqtt, Prometheus, Grafana, config-ui) to an encrypted [restic](https://restic.net) repository and removes old snapshots.

Without `BACKUP_REPOSITORY` the service logs one warning and does nothing: **no backup is made until you configure a repository.**

> [!IMPORTANT]
> The sidecar replaces Duplicati, which earlier balena releases contained. Updating removes Duplicati and its backup jobs. Take a last Duplicati backup before you update, then set the variables below.

Use **one repository per installation**. Set `BACKUP_REPOSITORY` as a **device** variable (or give each device its own path), not as a fleet variable: a fleet variable gives every device of the fleet the same repository. If devices must share a repository, give each its own `BACKUP_HOST`. Otherwise the retention of one device deletes snapshots of the others, and `restore` without a snapshot id can restore another device's data.

Set these as balena device variables:

| Variable                                                         | Default       | Meaning                                                                                |
| ---------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                              | – (off)       | restic repository, e.g. `s3:s3.amazonaws.com/bucket/attraccess` or `sftp:…`            |
| `BACKUP_PASSWORD`                                                | –             | Encrypts the repository. **Required**; lost together with the backups if you forget it |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …          | –             | Credentials of the target, passed to restic unchanged                                  |
| `BACKUP_SCHEDULE`                                                | `0 3 * * *`   | 5-field cron expression in the container time zone (`TZ`): daily at 03:00              |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY` | `7`, `4`, `6` | Retention: how many daily, weekly and monthly snapshots are kept                       |
| `BACKUP_HOST`                                                    | `attraccess`  | Name of this installation in the repository; only needed when devices share one        |

A run logs `backup started`, then either `backup SUCCEEDED in …s` or `BACKUP FAILED`. After a success the sidecar writes the time of the last success to `backup_last_success_timestamp_seconds.prom` in the `backup-state` volume (Prometheus textfile format). Nothing collects this file by default and no alert is set up: to alert on a missing backup, attach the volume to a node-exporter textfile collector (`--collector.textfile.directory`) and add an alert rule yourself.

The database dump only exists in the `backup-state` volume while a run is busy; it is deleted when the run ends. The database password is not passed on the command line of the PostgreSQL tools.

Run a backup right away, or list the snapshots in the repository (id, time, paths):

```bash
balena-engine exec -it <backup container> attraccess-backup backup
balena-engine exec -it <backup container> attraccess-backup snapshots
```

### Restoring with the sidecar

1. Stop every service except `postgres` and `backup`.
2. Look up the snapshot you want with `attraccess-backup snapshots`, and restore it by its id:

   ```bash
   balena-engine exec -it <backup container> attraccess-backup restore <snapshot-id>
   # elsewhere: docker compose run --rm backup restore <snapshot-id>
   ```

   The command first loads the dump with `pg_restore` into the database of `DATABASE_URL`, then writes the volumes back to their original place. If the database cannot be restored, the volumes are left untouched. It refuses a database that already has tables; add `--force` to replace its contents. Without an id it restores `latest`, the newest snapshot, which is not always the one you want (see below).

3. Start the other services again.

To restore onto a new device, bring the stack up, set the same `BACKUP_*` variables (including `BACKUP_HOST` if you set one), stop the other services and run the restore with `--force` and the snapshot id: the first start of Attraccess has already created the (empty) tables, which `--force` replaces. Do this **before** the first scheduled backup of the new device runs (by default at 03:00): that backup saves the empty new installation and becomes `latest`. If it has already run, pick the snapshot of the old device by its time in the `snapshots` list.

## Coolify

The Coolify template contains a PostgreSQL service. Use Coolify's own database backups for it: open the PostgreSQL resource, go to **Backups**, enable a schedule and an S3 destination. Coolify stores `pg_dump` files that you can restore through the same page, or with the `pg_restore` command above.

Coolify's backup covers the database only. Back up the storage volume (`/app/storage`: uploads and plugins) separately, for example with the `tar` command above on the Coolify host, or with Coolify's volume backup features.

Instead you can run the same restic sidecar as an additional service in your Coolify stack. No image of it is published: build it from the repository (`docker build -t attraccess-backup docker/backup`, or a `build:` entry pointing at `docker/backup` like the `backup` service in `docker-compose.balena.yml`), set the `BACKUP_*` variables above and `DATABASE_URL`, and mount the volumes you want to include below `/external-storage`. Otherwise stay with Coolify's own PostgreSQL backups plus a backup of the storage volume.

## Matter Sidecar Storage

With the Matter plugin installed, the Matter fabric lives in the **sidecar's own storage volume** (`MATTER_SIDECAR_STORAGE_DIR`), which is **not** part of the Attraccess volume. Back it up through the Matter plugin's encrypted backups, and keep the recovery key off the server. See [Matter: Backup and Recovery](plugins/matter/backup-restore.md).

## Tips

- Store backups on a separate server or cloud storage
- Test restoration regularly, on a spare machine
- Keep the `.env` file separately – it is not included in the storage volume

## See Also

- [Matter: Backup and Recovery](plugins/matter/backup-restore.md)
- [Updating](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)
