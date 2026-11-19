# Updating

<!-- llms-description: How to check for new Attraccess versions and update with Docker Compose, plain Docker or Portainer, pin a specific version, upgrade to 2.0 through 1.11, and move from SQLite to PostgreSQL. -->

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

## Moving from SQLite to PostgreSQL

Attraccess now runs on PostgreSQL only. This is a breaking change and ships in a major release. Installations of earlier releases that stored their data in `<STORAGE_ROOT>/attraccess.sqlite` move their data automatically on the first start.

### Before you upgrade

1. Create a [backup](installation/backup-restore.md) of the storage volume (it contains `attraccess.sqlite`).
2. **Add a PostgreSQL service** and point `DATABASE_URL` at an empty database. The shipped Compose files (Docker Compose, Portainer, Coolify, balena) already contain one (`postgres:18.6-alpine`, not part of the Attraccess image); see [Docker Compose](installation/docker-compose.md) and [Portainer](installation/portainer.md). If you started Attraccess with a bare `docker run`, you must start a PostgreSQL container and set `DATABASE_URL` **before** you pull the new image, because the new version does not start without it.
3. Make sure all plugins that hold data are installed in `<STORAGE_ROOT>/plugins` and can be loaded (see [Installing Plugins](plugins/installing-plugins.md)).
4. Plan for disk space: the old SQLite file stays on disk after the transfer (see below), next to the new PostgreSQL data.

Do not set `DATABASE_TYPE=sqlite`: the start fails with a message that links to this page.

### What happens on the first start

When the storage directory contains `attraccess.sqlite` and the PostgreSQL database is empty, Attraccess transfers the data **before** it accepts HTTP requests, talks to devices or starts plugins:

1. The SQLite file (with its `-wal` and `-shm` files) is copied to a temporary working copy. **The original is never modified.** Any supported older release works as the source: a frozen copy of the old SQLite migrations first brings the working copy up to the last SQLite schema.
2. The data, including the tables of installed plugins and their storage versions, is read into a neutral snapshot.
3. The snapshot is imported into PostgreSQL in **one transaction**. Identifiers and sequences, UTC points in time and exact decimal values are preserved, and balances are not applied twice. Foreign keys are checked inside the transaction, so a row that points to a missing row rolls the whole import back. After the commit a balance check compares the stored balances with the billing transactions; it only logs warnings (`Integrity check: …`) and does not undo the transfer.
4. On success the file is renamed to `attraccess.sqlite.migrated-to-postgres-<timestamp>`, and the log shows a row count per table. The renamed file is **kept and never deleted** by Attraccess; delete it yourself once you have verified the installation and have a PostgreSQL backup. The next start does not transfer again.

If renaming the file fails after a successful transfer (for example on a read-only storage volume), the API logs a warning and starts anyway: the data is already in PostgreSQL. On later starts the file is ignored because PostgreSQL now holds data. Rename or remove `attraccess.sqlite` yourself.

The log lines come from `SqliteTransfer`; follow them with `docker compose logs -f attraccess`. Large installations take longer to start the first time.

### Failure and retry

If anything fails, the PostgreSQL transaction is rolled back, the SQLite file is untouched, and the API stops with a clear error and a link to this page. Fix the cause and start again: the next start retries the transfer from the beginning.

- **A plugin is missing.** A plugin that has data in the SQLite file but is not installed stops the transfer with a clear error and nothing is imported. The error names the plugin. Install its build for this Attraccess version (see [Upgrading to Attraccess 2.0](#upgrading-to-attraccess-20)) and start again.
- **Two instances start at once.** A PostgreSQL advisory lock makes sure only one of them transfers; the other waits.
- **PostgreSQL already holds data.** If the database is not empty and the SQLite file still exists, Attraccess logs a warning and transfers nothing. Use the manual command below if you want to replace the data.

### Running the transfer manually

Stop the API first (`docker compose stop attraccess`), then run the command in a one-off container:

```bash
docker compose run --rm attraccess node dist/apps/api/main.js transfer-sqlite [--sqlite <path>] [--force] [--keep]
```

| Option            | Meaning                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `--sqlite <path>` | The SQLite file; default `<STORAGE_ROOT>/attraccess.sqlite`                                                  |
| `--force`         | Replace data that is already in the PostgreSQL database. Without it a non-empty target is refused. See below |
| `--keep`          | Do not rename the SQLite file after a successful transfer                                                    |

`--force` empties **every** Attraccess table in the target database before the import, including the audit log and the tables of plugins; the command lists the tables it empties. It refuses to run while the API (or another client) is connected to that database. Take a PostgreSQL backup first if the data in it matters.

In a development checkout the equivalent is `pnpm nx run api:transfer-sqlite -- --sqlite <path>`.

## Upgrading to Attraccess 2.0

Attraccess 2.0 takes over the data of plugins (WAGO, Matter, Shelly, Reservations and others) only from the last 1.x
release, **Attraccess 1.11**. Update in two steps:

1. Create a [backup](installation/backup-restore.md).
2. Update to Attraccess 1.11 (pin the newest `v1.11.x` tag, see [Pinning a specific version](#pinning-a-specific-version))
   and start it **once**, so every plugin finishes its migrations. Check in **Settings → Plugins** that all plugins
   load.
3. Create another backup, then update to 2.0.

If you skip step 2, for example coming from 1.10, Attraccess 2.0 refuses each affected plugin with a message such as:
"Attraccess 2.0 adopts the data of plugin "wago" only from the last 1.x release (1.11). Restore the backup taken before
this upgrade, update to Attraccess 1.11 and start it once so the plugin's migrations finish, then update to 2.0."
Nothing is changed in that case: follow the message.

Plugins built for 1.x do not load on 2.0 at all; install their 2.0 builds (see
[Upgrading to Attraccess 2.0](plugins/installing-plugins.md#upgrading-to-attraccess-20) in the plugin guide).

## Docker Compose

```bash
cd /path/to/attraccess

# Pull the latest image
docker compose pull

# Restart the container with the new image
docker compose up -d
```

Attraccess runs database migrations automatically on startup. Within a major version no manual steps are required.
Upgrading from 1.x needs extra steps, see [Moving from SQLite to PostgreSQL](#moving-from-sqlite-to-postgresql) and [Upgrading to Attraccess 2.0](#upgrading-to-attraccess-20).

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
