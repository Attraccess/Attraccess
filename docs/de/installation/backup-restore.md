# Backup & Wiederherstellung

SQLite speichert relationale Daten im Storage-Verzeichnis. Hochgeladene Dateien, installierte Plugins und die Verschlüsselungs- und Sitzungskonfiguration müssen ebenfalls gesichert werden. Bei Sitzungen in Valkey ist dessen Persistenz eine getrennte Backup-Aufgabe.

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
# Vor dem Kopieren alle schreibenden Prozesse stoppen
docker compose stop attraccess

# Backup des Storage-Volumes erstellen
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/attraccess-backup-$(date +%Y%m%d).tar.gz -C /data .

# Container wieder starten
docker compose start attraccess
```

Vor einer Dateikopie alle API-Instanzen, Hintergrundkoordinatoren und eigenständigen Migrations- oder Seed-Prozesse stoppen. Das ganze Storage-Verzeichnis einschließlich vorhandener SQLite-Journal- und WAL-Dateien sichern. Nicht nur die Hauptdatei kopieren, während Schreibvorgänge weiterlaufen.

### Automatisches Backup

Erstellen Sie ein Cronjob-Skript `/etc/cron.daily/attraccess-backup`:

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/pfad/zu/backups
DAYS_TO_KEEP=30
mkdir -p "$BACKUP_DIR"

# Dieses Beispiel setzt einen Compose-Dienst für alle Schreibvorgänge voraus.
docker compose stop attraccess
trap 'docker compose start attraccess' EXIT

docker run --rm \
  -v attraccess-storage:/data \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf /backup/attraccess-$(date +%Y%m%d).tar.gz -C /data .

# Alte Backups löschen
find "$BACKUP_DIR" -name "attraccess-*.tar.gz" -mtime +$DAYS_TO_KEEP -delete
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

## Wiederherstellung vor der Umstellung prüfen

Zuerst in ein isoliertes Storage-Verzeichnis mit den passenden Anwendungs- und Plugin-Versionen wiederherstellen. Das ursprüngliche Backup unverändert behalten. Die konfigurierten Verschlüsselungsschlüssel erhalten; andere Schlüssel können gespeicherte Zugangsdaten unlesbar machen. Geheimnisse und private Datenbankinhalte nicht in Prüfprotokolle schreiben.

Stabile Benutzer- und Ressourcen-IDs, Zugriffsrechte, Authentifizierung und Sitzungen, abgeschlossene Buchungen und Guthaben, exakte Messzähler und Belege, Betriebshistorie, unveränderliche Audit- und Operationsbelege sowie Plugin-Datensätze prüfen. Auch `migrations` und `plugin_migrations_*` müssen erhalten bleiben. Neben Zeilenzahlen exakte Werte und Beziehungen vergleichen. Die isolierte Anwendung starten, Migrationsergebnisse und typische Abläufe prüfen und erneut starten, um doppelte Migrationen oder Wirkungen auszuschließen. Die Testkopie stoppen, bevor die Produktionsinstanz wieder Schreibvorgänge annimmt.

Automatische Upgrade-Tests verwenden konstruierte historische SQLite-Datenbanken. Sie ersetzen keinen Wiederherstellungstest des eigenen Backups.

## Datenbanksystem austauschen

`DATABASE_TYPE` wählt nur ein implementiertes Backend. Es kopiert und konvertiert keine Datenbank. Zurzeit steht nur SQLite zur Verfügung. Eine spätere Übernahme muss IDs, Beziehungen, exakte Zahlenzeichenfolgen und Beträge, UTC-Zeitpunkte, Binärdaten, verschlüsselte Zugangsdaten, Plugin-Daten und beide Migrationshistorien erhalten. Diese Version enthält keinen SQLite-zu-PostgreSQL-Transferbefehl. Backups und eine Rückkehrstrategie festlegen, bevor nach einer späteren Umstellung Schreibvorgänge erlaubt werden. Das Zurücksetzen der Auswahl nimmt bereits akzeptierte Schreibvorgänge nicht zurück. Siehe [Ein Datenbank-Backend ergänzen](developer/adding-a-database-backend.md).

## Tipps

- Sichern Sie Backups auf einem separaten Server oder Cloud-Speicher
- Testen Sie die Wiederherstellung regelmäßig
- Bewahren Sie die `.env`-Datei separat auf – sie ist nicht im Storage-Volume enthalten

## Siehe auch

- [Aktualisierung](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)

### Importreihenfolge und Wertdarstellung

Ein künftiger Import zwischen Engines benötigt einen konsistenten Snapshot bei gestoppten Schreibern. Lade referenzierte Datensätze vor abhängigen; verschiebe zyklische Constraints oder stelle Beziehungen in einem zweiten transaktionalen Lauf wieder her. Erhalte explizite IDs und setze Schlüsselgeneratoren von Kern und Plugins über die importierten Höchstwerte. Unterscheide SQL-NULL, JSON null und fehlende Felder; Booleans verwenden true/false, JSON wird einmal gemäß Schema dekodiert, exakte Zähler/Beträge verwenden Dezimalzeichenketten, Zeiten UTC und Binärdaten markiertes Base64. Prüfe Beziehungen, Anzahlen, exakte Werte, Salden und Migrationsidentitäten vor der Schreibfreigabe. Der vollständige [Transfervertrag](developer/adding-a-database-backend.md) beschreibt auch generierte Spalten, Sequenzkollisionen und Wiederherstellung nach dem Wechsel. Die Implementierung gehört zu ATT-584; hier wird kein Transferbefehl bereitgestellt.
