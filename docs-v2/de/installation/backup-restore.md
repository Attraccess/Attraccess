# Backup & Wiederherstellung

Attraccess speichert alle Daten in einem einzigen Verzeichnis, was Backups einfach macht.

## Was wird gesichert?

Alle Daten liegen im **Storage-Verzeichnis** (Standard: `/app/storage` im Container):

| Datei/Ordner | Inhalt |
|-------------|--------|
| `attraccess.sqlite` | Datenbank mit allen Einstellungen, Benutzern, Ressourcen |
| `cache/` | Zwischengespeicherte Bilder (kann regeneriert werden) |
| `cdn/` | Hochgeladene Dateien (Bilder, Dokumente) |
| `plugins/` | Installierte Plugins |

> [!NOTE]
> Die Datenbank (`attraccess.sqlite`) ist die wichtigste Datei. Ohne sie sind alle Konfigurationen und Daten verloren.

## Backup erstellen

### Manuelles Backup

```bash
# Container stoppen (empfohlen für konsistentes Backup)
docker compose stop attraccess

# Backup des Storage-Volumes erstellen
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/attraccess-backup-$(date +%Y%m%d).tar.gz -C /data .

# Container wieder starten
docker compose start attraccess
```

### Automatisches Backup

Erstellen Sie ein Cronjob-Skript `/etc/cron.daily/attraccess-backup`:

```bash
#!/bin/bash
BACKUP_DIR=/pfad/zu/backups
DAYS_TO_KEEP=30

docker run --rm \
  -v attraccess-storage:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/attraccess-$(date +%Y%m%d).tar.gz -C /data .

# Alte Backups löschen
find $BACKUP_DIR -name "attraccess-*.tar.gz" -mtime +$DAYS_TO_KEEP -delete
```

## Backup wiederherstellen

```bash
# Container stoppen
docker compose stop attraccess

# Backup einspielen
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/attraccess-backup-DATUM.tar.gz -C /data"

# Container starten
docker compose start attraccess
```

> [!WARNING]
> Die Wiederherstellung überschreibt alle aktuellen Daten. Erstellen Sie vorher ein Backup des aktuellen Zustands.

## Tipps

- Sichern Sie Backups auf einem separaten Server oder Cloud-Speicher
- Testen Sie die Wiederherstellung regelmäßig
- Bewahren Sie die `.env`-Datei separat auf – sie ist nicht im Storage-Volume enthalten

## Siehe auch

- [Aktualisierung](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)
