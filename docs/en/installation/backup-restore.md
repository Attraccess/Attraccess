# Backup & Restore

<!-- llms-description: Explains what Attraccess data to back up, how to create a backup and how to restore it. -->

Attraccess stores all data in a single directory, making backups straightforward.

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
# Stop the container (recommended for consistent backup)
docker compose stop attraccess

# Create a backup of the storage volume
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/attraccess-backup-$(date +%Y%m%d).tar.gz -C /data .

# Start the container again
docker compose start attraccess
```

### Automated Backup

Create a cron job script at `/etc/cron.daily/attraccess-backup`:

```bash
#!/bin/bash
BACKUP_DIR=/path/to/backups
DAYS_TO_KEEP=30

docker run --rm \
  -v attraccess-storage:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/attraccess-$(date +%Y%m%d).tar.gz -C /data .

# Delete old backups
find $BACKUP_DIR -name "attraccess-*.tar.gz" -mtime +$DAYS_TO_KEEP -delete
```

## What a Backup Contains and Requires

The SQLite database holds the core data **and the tables of all plugins** together with their migration state (the core
`migrations` table and one migrations table per plugin). A backup is therefore one consistent unit:

- Stop the container, or use a consistent SQLite copy, so the file is not copied mid-write.
- Restore the database together with the `plugins/` folder, and start the Attraccess version the backup was made with
  or a newer one. Newer versions upgrade the database on start; an older version cannot open a database that a newer
  one has migrated.
- Balances, price snapshots and meter values are stored as exact values and come back unchanged.

The same requirements (stable identifiers, timestamps, exact values, plugin data and migration state) define the
[export and import contract](developer/adding-a-database-backend.md) for other database engines.

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

## Matter Sidecar Storage

With the Matter plugin installed, the Matter fabric lives in the **sidecar's own storage volume** (`MATTER_SIDECAR_STORAGE_DIR`), which is **not** part of the Attraccess volume. Back it up through the Matter plugin's encrypted backups, and keep the recovery key off the server. See [Matter: Backup and Recovery](plugins/matter/backup-restore.md).

## Tips

- Store backups on a separate server or cloud storage
- Test restoration regularly
- Keep the `.env` file separately – it is not included in the storage volume

## See Also

- [Matter: Backup and Recovery](plugins/matter/backup-restore.md)
- [Updating](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)
