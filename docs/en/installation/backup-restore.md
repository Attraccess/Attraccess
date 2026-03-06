# Backup & Restore

Attraccess stores all data in a single directory, making backups straightforward.

## What Gets Backed Up?

All data is stored in the **storage directory** (default: `/app/storage` in the container):

| File/Folder | Contents |
|-------------|----------|
| `attraccess.sqlite` | Database with all settings, users, resources |
| `cache/` | Cached images (can be regenerated) |
| `cdn/` | Uploaded files (images, documents) |
| `plugins/` | Installed plugins |

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

## Tips

- Store backups on a separate server or cloud storage
- Test restoration regularly
- Keep the `.env` file separately – it is not included in the storage volume

## See Also

- [Updating](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)
