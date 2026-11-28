# Updating

<!-- llms-description: How to check for and install Attraccess updates with Docker Compose, Docker or Portainer, pin a version, and move a 1.x installation from SQLite to PostgreSQL. -->

How to update Attraccess to the latest version.

## Check if a new version is available

If you have the **Manage System Configuration** permission, Attraccess shows a banner at the top of every page when a newer release is available on GitHub. The banner links to:

- The full release notes for the new version
- This updating guide

You can also check manually at any time by comparing your running version (shown at `GET /api/version`) against the [GitHub releases page](https://github.com/Attraccess/Attraccess/releases).

## Before Updating

> [!TIP]
> Create a [backup](installation/backup-restore.md) of your data before each update.

Check the [release notes](https://github.com/Attraccess/Attraccess/releases) for breaking changes before updating.

> [!WARNING]
> **Attractap readers pair again after the release that removes token sign-in (Attractap firmware 2.6.0).**
> Its first start deletes every reader record, together with reader names, resource links, per-reader
> settings and the card writer's reader choice. Every reader has to be paired again. Readers that still
> sign in with a token update over the air first and then show their pairing code. See [After the upgrade: every reader pairs again](attractap/pairing.md#after-the-upgrade-every-reader-pairs-again).

## Moving from SQLite to PostgreSQL

Attraccess now runs on PostgreSQL only. This is a breaking change and ships in a major release. Installations of earlier releases that stored their data in `<STORAGE_ROOT>/attraccess.sqlite` move their data automatically on the first start.

### Before you upgrade

1. **Stop the old instance** (every container that uses the storage volume) and create a [backup](installation/backup-restore.md) of the storage volume (it contains `attraccess.sqlite`). The first start migrates the SQLite file in place, so this backup is the only untouched copy of it. A 1.x instance that keeps running would write into a file that has already been copied.
2. **Add a PostgreSQL service** and point `DATABASE_URL` at an **empty** database. The shipped Compose files (Docker Compose, Portainer, Coolify, balena) already contain one (`postgres:18.6-alpine`, not part of the Attraccess image); see [Docker Compose](installation/docker-compose.md) and [Portainer](installation/portainer.md). If you started Attraccess with a bare `docker run`, you must start a PostgreSQL container and set `DATABASE_URL` **before** you pull the new image, because the new version does not start without it.
3. Plan for disk space: the old SQLite file stays on disk after the import (see below), next to the new PostgreSQL data. The storage folder and the SQLite file must be writable by the Attraccess container, because the file is migrated in place and then moved. If the file still needs SQLite migrations, a read-only file stops the start before anything is imported (`attempt to write a readonly database`); otherwise the import finishes and only the move fails (see [Failure and retry](#failure-and-retry)).
4. Write down how your plugins are configured. Plugin data is not moved (see [Plugin data is not moved](#plugin-data-is-not-moved)).
5. **balena:** the update removes Duplicati together with its backup jobs, and Attraccess no longer starts until the new [restic sidecar](installation/backup-restore.md#balena-restic-sidecar) is set up. Copy the Duplicati settings and set the new variables **before** you update, as described in [balena: from Duplicati to the restic sidecar](#balena-from-duplicati-to-the-restic-sidecar).

Do not set `DATABASE_TYPE=sqlite`: the start fails with a message that links to this page.

### balena: from Duplicati to the restic sidecar

Earlier balena releases backed up with Duplicati, which you set up in its web interface. The new release has no Duplicati: the update removes the service, its backup jobs and the settings you entered there. The new `backup` service (restic) takes its place and is set up with device variables. It **refuses to start without its settings, and Attraccess waits for it**: a device without backups does not go unnoticed. Read the Duplicati settings while Duplicati still runs, and set the new variables before the update.

**1. Read the Duplicati settings (old release, before the update).** Open the Duplicati web interface as before (port `8200` of the `duplicati` service, usually through a proxy host in Nginx Proxy Manager). For each backup job, choose **Export**, then **As command line**, and tick **Export passwords**. Keep the result in a password manager. The command holds the target URL with its options, `--passphrase` and `--retention-policy`; the schedule is not part of it, so also note it from the job's schedule page. Use them like this (value in the Duplicati export → setting of the sidecar):

- Target URL `s3://<bucket>/<folder>?s3-server-name=<server>&…` → `BACKUP_REPOSITORY=s3:https://<server>/<bucket>/<new folder>` (with `use-ssl=false`: `s3:http://…`; Amazon S3: `s3:s3.amazonaws.com/<bucket>/<new folder>`)
- `auth-username` (or `aws-access-key-id`) → `AWS_ACCESS_KEY_ID`
- `auth-password` (or `aws-secret-access-key`) → `AWS_SECRET_ACCESS_KEY`
- `s3-location-constraint` (region), if set → `AWS_DEFAULT_REGION`
- Target URL `b2://<bucket>/<folder>?auth-username=<key id>&auth-password=…` (or `b2-accountid`, `b2-applicationkey`) → `BACKUP_REPOSITORY=b2:<bucket>:<new folder>`, `B2_ACCOUNT_ID=<key id>`, `B2_ACCOUNT_KEY=<application key>`
- `--passphrase` → Not transferable: restic writes a new repository. Choose a new `BACKUP_PASSWORD`, and **keep the Duplicati passphrase** to read the old backups.
- Schedule page of the job (e.g. daily at 03:00; not in the export) → `BACKUP_SCHEDULE` (5-field cron, `0 3 * * *` is the default)
- `--retention-policy` (e.g. "smart" = `1W:1D,4W:1W,12M:1M`) → `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY` (for "smart": `7`, `4`, `12`)

Use a **new folder** for the restic repository, not the folder of the Duplicati files: the two formats must not mix, and the old Duplicati backups stay readable next to it. The sidecar backs up the same volumes that were mounted into the shipped `duplicati` service, plus a dump of the PostgreSQL database; other folders you added to your Duplicati job are not carried over. Other Duplicati targets (SFTP, WebDAV, …) map to [restic repositories](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html); check that the sidecar can reach them before you update.

**2. Set the new variables, still on the old release.** Set `BACKUP_REPOSITORY`, `BACKUP_PASSWORD`, the credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, …) and, if you need them, `BACKUP_SCHEDULE` and `BACKUP_KEEP_*` as **device** variables (not fleet variables, see [restic sidecar](installation/backup-restore.md#balena-restic-sidecar)). The `backup` service does not exist yet, so they cannot be service variables; balena restarts the running services once to apply them, which does no harm. If the device has to run without backups for now, set `BACKUP_DISABLED=true` instead: Attraccess then starts and logs a warning.

**3. Take a last Duplicati backup.** Once balena has applied the variables, stop the `attraccess` service in the balena dashboard (step 1 of [Before you upgrade](#before-you-upgrade)): stopping it before step 2 is not enough, because applying the variables can start it again. Run the job with its **Start** button on the Duplicati home page and wait until it succeeds. This backup holds the untouched `attraccess.sqlite`. Leave `attraccess` stopped until the update.

**4. Update the device** to the new release.

**5. Check the sidecar.** Its log shows `backups enabled: schedule …`, and Attraccess starts. The start only checks the settings themselves (present and valid), not that the target works, so run a first backup right away and list it:

```bash
balena-engine exec -it <backup container> attraccess-backup backup
balena-engine exec -it <backup container> attraccess-backup snapshots
```

If the `attraccess` service logs `waiting for the backup service` instead, the `backup` service log names the setting that is missing or invalid. Fix the variable; the services restart and Attraccess starts on its own. If the backup itself ends with `BACKUP FAILED`, the lines before it name the cause (address, credentials, a wrong password for an existing repository); until the next successful run the [`BackupFailed`](monitoring/prometheus-grafana.md#backup-alerts) alert fires.

**6. Keep the old Duplicati backups** until the restic snapshots reach back far enough for you. To restore one of them later, install Duplicati anywhere (for example on a laptop), open **Restores** and choose **Direct restore from backup files**, and enter the target URL and passphrase from step 1. Then delete the Duplicati folder in the bucket.

If the device was already updated without step 1, the Duplicati settings are gone with the service; take the address and the credentials of the target from your storage provider instead.

### What happens on the first start

On every start Attraccess waits for PostgreSQL and applies the pending database migrations **before** it checks the license, starts plugins, accepts HTTP requests or talks to devices. On the first start of 2.0 these are:

1. The baseline migration creates the PostgreSQL schema, equal to the last SQLite schema.
2. The import migration looks for `<STORAGE_ROOT>/attraccess.sqlite`. Without the file it does nothing (a new installation) and logs `No SQLite file at <file>: nothing to import.` Check that line if you expected an import: the import runs only once, so a first start without the file (volume not mounted, other `STORAGE_ROOT`) leaves an empty installation. With the file, it first applies the released SQLite migrations **to the file itself**, so the file is changed in place.
3. It copies every core table into PostgreSQL in **one transaction**. Identifiers and sequences are preserved (new identifiers continue after the highest one SQLite ever issued), points in time are stored as UTC (a time without offset counts as UTC), decimal values stay exact, JSON is kept, and balances are taken as they are, not applied twice. Foreign keys are checked before the commit.
4. After the commit the SQLite file is moved out of the way (see below). Later migrations, for example the global forms, then run on the imported data like on any other installation.

The import migration runs only once. Large installations take longer to start the first time.

### Where the SQLite file goes

After a successful import the SQLite file and its `-wal`, `-shm` and `-journal` files are moved to `<STORAGE_ROOT>/sqlite-backup/`. An existing file is never overwritten: if `sqlite-backup/attraccess.sqlite` already exists, the new file gets a UTC timestamp in its name, for example `attraccess-20261121T093000123Z.sqlite`.

Attraccess **keeps the file and never deletes it**. Delete it yourself once you have verified the installation and have a PostgreSQL backup. The file in `sqlite-backup/` is the migrated file, not the original: to go back to 1.x, restore the storage-volume backup you made before the upgrade.

### Plugin data is not moved

The import copies only the core tables. Tables PostgreSQL has no table for, which are the tables of plugins, their `plugin_migrations_*` tables and the plugin storage bookkeeping, are not copied. Their names are logged once as a warning that also names the backup file.

Plugins therefore start with empty storage on PostgreSQL. Install their 2.0 builds as usual and set them up again; plugins built for 1.x do not load on 2.0 (see [Upgrading to Attraccess 2.0](plugins/installing-plugins.md#upgrading-to-attraccess-20)). The old plugin data stays in the backup file (and in your pre-upgrade backup).

### Failure and retry

If the import fails before the commit, nothing is imported, the SQLite file stays where it is, and the API stops with an error. A row that cannot be stored (an invalid point in time, a broken foreign key, a violated constraint) fails the whole import; the message names the table, the row (by its key) and the column or constraint; a broken foreign key names the constraint and up to five offending keys. Other values of the row are never shown. Correct or delete the row in `attraccess.sqlite` (for example with the `sqlite3` tool, on a copy first) or report the message on GitHub, then start again: the next start retries the import. The file may already be at the last SQLite schema by then, which is harmless. Each migration runs in its own transaction, so the baseline stays applied; the import empties the baseline's seed rows before it copies.

- **PostgreSQL already holds users and the SQLite file exists.** The start fails with an error that names the file, and nothing is changed. Either empty the PostgreSQL database (drop and recreate the database or its schema) and start again, or, if PostgreSQL already holds your data, move the SQLite file out of the storage folder. This also happens when an earlier start imported the file but stopped before moving it (the log then shows `Copied <rows> rows into PostgreSQL (committed).`): PostgreSQL holds your data, so move the file to `<STORAGE_ROOT>/sqlite-backup/`.
- **Two instances start at once.** The migrations run under a PostgreSQL advisory lock: one instance runs them, the other logs `Waiting for another instance to finish the database migrations...`, waits and then finds nothing left to do.
- **Moving the file fails after the commit** (for example because a file named `sqlite-backup` is in the way). Attraccess logs a warning and starts anyway: the data is already in PostgreSQL and the import counts as done, so it never runs again. Move or delete `attraccess.sqlite` (and its `-wal`, `-shm` and `-journal` files) yourself.

### Log lines to look for

Follow the start with `docker compose logs -f attraccess`. The import logs under `SqliteImport`:

```text
Importing the SQLite database <file> into PostgreSQL...
Brought the SQLite file to the last SQLite migration (N migration(s) applied).
Copied <rows> rows into PostgreSQL (committed).
SQLite import complete: <rows> rows in <n> tables; the SQLite file is at <path>.
  <table>: <rows>
Not imported (plugin data and other tables PostgreSQL has no table for): ...
```

The completion line is followed by one line per table. Before that, `DatabaseStartup` logs `Database: PostgreSQL <url> (schema ...)` with the password removed from the URL.

## Docker Compose

```bash
cd /path/to/attraccess

# Pull the latest image
docker compose pull

# Restart the container with the new image
docker compose up -d
```

Attraccess runs database migrations automatically on startup. Within a major version no manual steps are required.
Upgrading from 1.x needs extra steps, see [Moving from SQLite to PostgreSQL](#moving-from-sqlite-to-postgresql).

## Plain Docker

```bash
# Stop and remove the running container (data volumes are preserved)
docker stop attraccess && docker rm attraccess

# Pull the latest image from Docker Hub or GHCR
docker pull attraccess/attraccess:latest
# or:
docker pull ghcr.io/attraccess/attraccess:latest

# Recreate the container with the same volumes/env you used before, plus DATABASE_URL of a
# PostgreSQL service you started first (see "Moving from SQLite to PostgreSQL")
docker run -d --name attraccess ... attraccess/attraccess:latest
```

## Portainer

1. Open Portainer
2. Navigate to **Stacks** → `attraccess`
3. Click **Pull and redeploy**
4. Confirm the action

## Pinning a specific version

By default the `latest` tag tracks the newest release. To pin to a specific version, replace `latest` with the desired semver tag (for example `v0.1.2`) in your `docker-compose.yml`:

```yaml
services:
  attraccess:
    image: attraccess/attraccess:v0.1.2
```

Then run `docker compose up -d` to apply.

## Troubleshooting

If problems occur after an update:

1. Check the logs:
   ```bash
   docker compose logs -f attraccess
   ```
2. Restore a [backup](installation/backup-restore.md) if needed
3. Report issues on [GitHub](https://github.com/Attraccess/Attraccess/issues)

## See Also

- [Backup & Restore](installation/backup-restore.md)
- [Common Issues](faq/common-issues.md)
