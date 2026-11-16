# Backup & Wiederherstellung

<!-- llms-description: Erklärt, welche Attraccess-Daten gesichert werden, wie Sie ein Backup erstellen und wiederherstellen. -->

Attraccess speichert alle Daten in einem einzigen Verzeichnis, was Backups einfach macht.

## Was wird gesichert?

Alle Daten liegen im **Storage-Verzeichnis** (Standard: `/app/storage` im Container):

| Datei/Ordner        | Inhalt                                                   |
| ------------------- | -------------------------------------------------------- |
| `attraccess.sqlite` | Datenbank mit allen Einstellungen, Benutzern, Ressourcen |
| `cache/`            | Zwischengespeicherte Bilder (kann regeneriert werden)    |
| `cdn/`              | Hochgeladene Dateien (Bilder, Dokumente)                 |
| `plugins/`          | Installierte Plugins                                     |

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

## Inhalt und Voraussetzungen eines Backups

Die SQLite-Datenbank enthält die Kerndaten **und die Tabellen aller Plugins** samt Migrationsstand (die Kern-Tabelle
`migrations` und je eine Migrationstabelle pro Plugin). Ein Backup ist daher eine konsistente Einheit:

- Container stoppen oder eine konsistente SQLite-Kopie verwenden, damit die Datei nicht mitten im Schreiben kopiert wird.
- Datenbank zusammen mit dem Ordner `plugins/` wiederherstellen und die Attraccess-Version starten, mit der das Backup
  erstellt wurde, oder eine neuere. Neuere Versionen aktualisieren die Datenbank beim Start; eine ältere Version kann
  eine von einer neueren migrierte Datenbank nicht öffnen.
- Guthaben, Preis-Snapshots und Zählerwerte liegen als exakte Werte vor und kommen unverändert zurück.

Dieselben Anforderungen (stabile Bezeichner, Zeitstempel, exakte Werte, Plugin-Daten und Migrationsstand) bilden den
[Export-/Import-Vertrag](developer/adding-a-database-backend.md) für andere Datenbank-Engines.

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

## Speicher des Matter-Sidecars

Ist das Matter-Plugin installiert, liegt die Matter-Fabric im **eigenen Speicher-Volume des Sidecars** (`MATTER_SIDECAR_STORAGE_DIR`), das **nicht** zum Attraccess-Volume gehört. Sichern Sie sie über die verschlüsselten Backups des Matter-Plugins und bewahren Sie den Wiederherstellungsschlüssel außerhalb des Servers auf. Siehe [Matter: Backup und Wiederherstellung](plugins/matter/backup-restore.md).

## Tipps

- Sichern Sie Backups auf einem separaten Server oder Cloud-Speicher
- Testen Sie die Wiederherstellung regelmäßig
- Bewahren Sie die `.env`-Datei separat auf – sie ist nicht im Storage-Volume enthalten

## Siehe auch

- [Matter: Backup und Wiederherstellung](plugins/matter/backup-restore.md)
- [Aktualisierung](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)
