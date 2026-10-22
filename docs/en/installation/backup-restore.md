# Backup & Restore

SQLite stores relational data in the storage directory. Back up uploaded files, installed plugins and encryption/session configuration with it. If sessions use Valkey, their persistence is a separate backup responsibility.

## What Gets Backed Up?

All data is stored in the **storage directory** (default: `/app/storage` in the container):

| File/Folder         | Contents                                     |
| ------------------- | -------------------------------------------- |
| `attraccess.sqlite` | Database with all settings, users, resources |
| `cache/`            | Cached images (can be regenerated)           |
| `cdn/`              | Uploaded files (images, documents)           |
| `plugins/`          | Installed plugins                            |

> [!NOTE]
> The database (`attraccess.sqlite`) is the most important file. Without it, all configuration and data is lost.

## Creating a Backup

### Manual Backup

```bash
# Stop every writer before copying database files
docker compose stop attraccess

# Create a backup of the storage volume
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/attraccess-backup-$(date +%Y%m%d).tar.gz -C /data .

# Start the container again
docker compose start attraccess
```

Stop every API instance, background coordinator and standalone migration/seed writer before a filesystem copy. Include the whole storage directory, including any SQLite journal/WAL companion files. Do not copy only the main database while writes continue.

### Automated Backup

Create a cron job script at `/etc/cron.daily/attraccess-backup`:

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/path/to/backups
DAYS_TO_KEEP=30
mkdir -p "$BACKUP_DIR"

# This example assumes one Compose service owns all writers.
docker compose stop attraccess
trap 'docker compose start attraccess' EXIT

docker run --rm \
  -v attraccess-storage:/data \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf /backup/attraccess-$(date +%Y%m%d).tar.gz -C /data .

# Delete old backups
find "$BACKUP_DIR" -name "attraccess-*.tar.gz" -mtime +$DAYS_TO_KEEP -delete
```

## Restoring a Backup

```bash
# Stop the container
docker compose stop attraccess

# Restore the backup
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/attraccess-backup-DATE.tar.gz -C /data"

# Start the container
docker compose start attraccess
```

> [!WARNING]
> Restoring overwrites all current data. Create a backup of the current state first.

## Verify a restore before cutover

Restore into an isolated storage directory with the matching application and plugin versions first. Keep the original backup unchanged. Preserve the configured encryption secrets; replacing them can make stored credentials unreadable. Do not print secrets or private database contents into verification logs.

Check stable user/resource IDs and access grants, authentication and session behavior, completed ledger amounts and balances, exact meter counters and evidence, operating history, immutable audit/operation receipts, plugin records, and both `migrations` and `plugin_migrations_*` histories. Compare exact values and relationships as well as row counts. Start the restored application once, check migration results and representative workflows, then restart to confirm there are no duplicate migrations or effects. Stop the isolated copy before restoring or enabling the production writer.

The automated upgrade tests use constructed historical SQLite databases. They do not replace a restore test of your own backup.

## Backend replacement

`DATABASE_TYPE` only selects an implemented backend; it never copies or converts a database. SQLite is currently the only choice. A future transfer must preserve IDs, relationships, exact numeric strings and amounts, UTC timestamps, binary data, credential envelopes, plugin data and core/plugin migration state. There is no SQLite-to-PostgreSQL transfer command in this release. Keep backups and define recovery before permitting writes after a future cutover; reverting a selector cannot undo accepted writes. See [Adding a database backend](developer/adding-a-database-backend.md).

## Tips

- Store backups on a separate server or cloud storage
- Test restoration regularly
- Keep the `.env` file separately – it is not included in the storage volume

## See Also

- [Updating](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)

### Transfer ordering and representations

A future cross-engine import must use one consistent stopped-writer snapshot, load referenced records before dependants (defer cyclic constraints or restore relationships in a second transactional pass), preserve explicit IDs, and reset core/plugin generated-key sequences above imported maxima. Preserve SQL null, JSON null and missing fields distinctly; booleans use true/false, JSON is decoded once according to the schema, exact counters/amounts use decimal strings, dates use UTC and bytes use tagged base64. Verify relationships, counts, exact values, balances and migration identities before writes. The full [cross-engine transfer contract](developer/adding-a-database-backend.md#cross-engine-transfer-contract-implementation-in-att-584) also defines generated columns, sequence collision checks and recovery after cutover. ATT-584 owns implementation; no transfer command is supplied here.
