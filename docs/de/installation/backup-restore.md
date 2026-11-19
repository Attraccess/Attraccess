# Backup & Wiederherstellung

<!-- llms-description: Erklärt, welche Attraccess-Daten gesichert werden (PostgreSQL-Datenbank und Storage-Volume), wie Sie mit dem balena-Sidecar, Coolify oder pg_dump sichern und wie Sie wiederherstellen. -->

Attraccess hält seine Daten an zwei Orten. Ein Backup muss beide enthalten, zu ungefähr gleicher Zeit gesichert:

| Was                                      | Wo                                                          | Inhalt                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **PostgreSQL-Datenbank** (`attraccess`)  | Der Dienst `postgres` Ihres Stacks (Volume `postgres-data`) | Alle Einstellungen, Benutzer, Ressourcen, Nutzung, Abrechnung, Audit-Log **und die Tabellen aller Plugins** |
| **Storage-Verzeichnis** (`/app/storage`) | Das Volume `attraccess-storage`                             | `cdn/` (hochgeladene Dateien), `plugins/` (installierte Plugins), `cache/` (kann regeneriert werden)        |

> [!NOTE]
> Die Datenbank ist der wichtigste Teil. Ohne sie sind alle Konfigurationen und Daten verloren. Eine Kopie des Datenverzeichnisses eines laufenden PostgreSQL ist **kein** gültiges Backup: Verwenden Sie `pg_dump`, wie unten beschrieben.

Bewahren Sie außerdem Ihre `.env`-Datei (sie enthält `AUTH_SESSION_SECRET` und das Datenbankpasswort) und die Daten weiterer Dienste Ihres Stacks (z. B. Mosquitto- oder Grafana-Volumes) sicher auf. Sie gehören nicht zum Storage-Volume.

## Inhalt und Voraussetzungen eines Backups

Die Datenbank enthält die Kerndaten **und die Tabellen aller Plugins** samt Migrationsstand (die Kern-Tabelle `migrations` und je eine Migrationstabelle pro Plugin). Ein `pg_dump` ist daher eine konsistente Einheit.

- Datenbank zusammen mit dem Ordner `plugins/` wiederherstellen und die Attraccess-Version starten, mit der das Backup erstellt wurde, oder eine neuere. Neuere Versionen aktualisieren die Datenbank beim Start; eine ältere Version kann eine von einer neueren migrierte Datenbank nicht öffnen.
- Guthaben, Preis-Snapshots und Zählerwerte liegen als exakte Werte vor und kommen unverändert zurück.
- Behalten Sie den `AUTH_SESSION_SECRET` aus der Zeit des Backups. Er schützt die gespeicherten Reader-Kopplungsschlüssel.
- Ein 1.x-**SQLite**-Backup (`attraccess.sqlite`) wird über die automatische Übernahme eingespielt, siehe [Aktualisierung](installation/updating.md#umzug-von-sqlite-auf-postgresql).

Dieselben Anforderungen (stabile Bezeichner, Zeitstempel, exakte Werte, Plugin-Daten und Migrationsstand) bilden den [Export-/Import-Vertrag](developer/adding-a-database-backend.md) für die SQLite-Übernahme.

## Docker Compose und andere einfache Setups

### Manuelles Backup

Sichern Sie die Datenbank im benutzerdefinierten PostgreSQL-Format (komprimiert, mit `pg_restore` wiederherstellbar) und archivieren Sie das Storage-Volume. Passen Sie Dienstname, Benutzer und Datenbank an Ihre Compose-Datei an; die mitgelieferten Dateien verwenden die Datenbank `attraccess`.

```bash
mkdir -p backups

# Datenbank (konsistent, Attraccess läuft weiter)
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" attraccess' \
  > backups/attraccess-db-$(date +%Y%m%d).dump

# Storage-Volume (Uploads, Plugins)
docker run --rm \
  -v attraccess-storage:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/attraccess-storage-$(date +%Y%m%d).tar.gz -C /data .
```

`pg_dump` erstellt einen konsistenten Schnappschuss, ohne Attraccess anzuhalten. Für die beste Übereinstimmung von Datenbank und Dateien führen Sie beide Befehle direkt nacheinander aus oder stoppen den Dienst `attraccess` während der Sicherung.

> [!NOTE]
> Solange `pg_dump` läuft, hält es auf jeder Tabelle eine Share-Sperre, bis der Dump fertig ist. Die normale Nutzung von Attraccess läuft weiter, aber Schemaänderungen warten: Ein Plugin während eines Backups zu installieren oder zu aktualisieren oder Attraccess zu aktualisieren, kann mit einem Lock-Timeout fehlschlagen. Wiederholen Sie den Vorgang nach dem Backup, und legen Sie automatische Backups (auch den balena-Sidecar und Coolify-Backups) außerhalb der Zeiten, in denen Sie Plugins installieren oder aktualisieren.

### Automatisches Backup

Erstellen Sie ein Cronjob-Skript `/etc/cron.daily/attraccess-backup`:

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/pfad/zu/backups
DAYS_TO_KEEP=30
cd /pfad/zu/attraccess   # das Verzeichnis mit Ihrer docker-compose.yml

docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" attraccess' \
  > $BACKUP_DIR/attraccess-db-$(date +%Y%m%d).dump

docker run --rm \
  -v attraccess-storage:/data:ro \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/attraccess-storage-$(date +%Y%m%d).tar.gz -C /data .

# Alte Backups löschen
find $BACKUP_DIR -name "attraccess-*" -mtime +$DAYS_TO_KEEP -delete
```

### Wiederherstellen

```bash
# 1. Attraccess stoppen (postgres läuft weiter)
docker compose stop attraccess

# 2. Datenbank durch den Dump ersetzen
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists attraccess && createdb -U "$POSTGRES_USER" attraccess'
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d attraccess --no-owner' \
  < backups/attraccess-db-DATUM.dump

# 3. Storage-Volume einspielen
docker run --rm \
  -v attraccess-storage:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/attraccess-storage-DATUM.tar.gz -C /data"

# 4. Attraccess starten
docker compose start attraccess
```

> [!WARNING]
> Die Wiederherstellung überschreibt alle aktuellen Daten. Erstellen Sie vorher ein Backup des aktuellen Zustands. `dropdb` schlägt fehl, solange andere Sitzungen verbunden sind; stoppen Sie vorher jeden Dienst, der die Datenbank nutzt.

## balena: restic-Sidecar

Der balena-Stack (`docker-compose.balena.yml`) enthält einen Dienst `backup`. Er sichert jede Nacht die PostgreSQL-Datenbank (`pg_dump -Fc`), lädt den Dump zusammen mit den Volumes des Stacks (Proxy-Daten und Zertifikate, `attraccess-storage`, webhook-site, RabbitMQ, zigbee2mqtt, Prometheus, Grafana, config-ui) in ein verschlüsseltes [restic](https://restic.net)-Repository hoch und entfernt alte Snapshots.

Ohne `BACKUP_REPOSITORY` meldet der Dienst einmal eine Warnung und tut nichts: **Es wird kein Backup erstellt, bis Sie ein Repository konfigurieren.**

Setzen Sie diese Werte als balena-Geräte- oder Flottenvariablen:

| Variable                                                         | Standard      | Bedeutung                                                                                       |
| ---------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `BACKUP_REPOSITORY`                                              | – (aus)       | restic-Repository, z. B. `s3:s3.amazonaws.com/bucket/attraccess` oder `sftp:…`                  |
| `BACKUP_PASSWORD`                                                | –             | Verschlüsselt das Repository. **Pflicht**; geht mit den Backups verloren, wenn Sie es vergessen |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `B2_*`, …          | –             | Zugangsdaten des Ziels, unverändert an restic weitergereicht                                    |
| `BACKUP_SCHEDULE`                                                | `0 3 * * *`   | Cron-Ausdruck mit 5 Feldern in der Zeitzone des Containers (`TZ`): täglich um 03:00 Uhr         |
| `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY` | `7`, `4`, `6` | Aufbewahrung: Wie viele tägliche, wöchentliche und monatliche Snapshots bleiben                 |

Ein Lauf protokolliert `backup started` und danach entweder `backup SUCCEEDED in …s` oder `BACKUP FAILED`. Nach einem Erfolg schreibt der Sidecar den Zeitpunkt des letzten Erfolgs in die Datei `backup_last_success_timestamp_seconds.prom` im Volume `backup-state` (Prometheus-Textfile-Format). Standardmäßig liest niemand diese Datei, und es ist kein Alarm eingerichtet: Um bei einem ausbleibenden Backup alarmiert zu werden, binden Sie das Volume in einen Textfile-Collector von node-exporter ein (`--collector.textfile.directory`) und legen selbst eine Alarmregel an.

Der Datenbank-Dump liegt nur während eines laufenden Backups im Volume `backup-state`; am Ende des Laufs wird er gelöscht. Das Datenbankpasswort steht nicht in der Befehlszeile der PostgreSQL-Werkzeuge.

Ein Backup sofort ausführen oder die Snapshots im Repository auflisten (ID, Zeitpunkt, Pfade):

```bash
balena-engine exec -it <backup-container> attraccess-backup backup
balena-engine exec -it <backup-container> attraccess-backup snapshots
```

### Wiederherstellen mit dem Sidecar

1. Stoppen Sie alle Dienste außer `postgres` und `backup`.
2. Suchen Sie den gewünschten Snapshot mit `attraccess-backup snapshots` heraus und stellen Sie ihn über seine ID wieder her:

   ```bash
   balena-engine exec -it <backup-container> attraccess-backup restore <snapshot-id>
   # anderswo: docker compose run --rm backup restore <snapshot-id>
   ```

   Der Befehl lädt zuerst den Dump mit `pg_restore` in die Datenbank aus `DATABASE_URL` und schreibt danach die Volumes an ihren ursprünglichen Ort zurück. Lässt sich die Datenbank nicht wiederherstellen, bleiben die Volumes unverändert. Er lehnt eine Datenbank ab, die schon Tabellen enthält; mit `--force` ersetzen Sie deren Inhalt. Ohne ID stellt er `latest` wieder her, den neuesten Snapshot, der nicht immer der gewünschte ist (siehe unten).

3. Starten Sie die übrigen Dienste wieder.

Für eine Wiederherstellung auf einem neuen Gerät starten Sie den Stack, setzen dieselben `BACKUP_*`-Variablen, stoppen die übrigen Dienste und führen die Wiederherstellung mit `--force` und der Snapshot-ID aus: Der erste Start von Attraccess hat die (leeren) Tabellen bereits angelegt, `--force` ersetzt sie. Tun Sie das, **bevor** das erste geplante Backup des neuen Geräts läuft (standardmäßig um 03:00 Uhr): Dieses Backup sichert die leere neue Installation und wird zu `latest`. Ist es schon gelaufen, wählen Sie den Snapshot des alten Geräts anhand seines Zeitpunkts in der Liste von `snapshots`.

## Coolify

Das Coolify-Template enthält einen PostgreSQL-Dienst. Nutzen Sie dafür die eigenen Datenbank-Backups von Coolify: Öffnen Sie die PostgreSQL-Ressource, wechseln Sie zu **Backups** und aktivieren Sie einen Zeitplan und ein S3-Ziel. Coolify legt `pg_dump`-Dateien ab, die Sie über dieselbe Seite oder mit dem oben gezeigten `pg_restore`-Befehl wiederherstellen.

Das Coolify-Backup umfasst nur die Datenbank. Sichern Sie das Storage-Volume (`/app/storage`: Uploads und Plugins) getrennt, etwa mit dem `tar`-Befehl von oben auf dem Coolify-Host oder mit den Volume-Backup-Funktionen von Coolify.

Alternativ betreiben Sie denselben restic-Sidecar als zusätzlichen Dienst in Ihrem Coolify-Stack. Ein fertiges Image davon wird nicht veröffentlicht: Bauen Sie es aus dem Repository (`docker build -t attraccess-backup docker/backup` oder ein `build:`-Eintrag, der wie beim Dienst `backup` in `docker-compose.balena.yml` auf `docker/backup` zeigt), setzen Sie die oben genannten `BACKUP_*`-Variablen und `DATABASE_URL` und binden Sie die Volumes, die enthalten sein sollen, unterhalb von `/external-storage` ein. Andernfalls bleiben Sie bei den eigenen PostgreSQL-Backups von Coolify plus einer Sicherung des Storage-Volumes.

## Speicher des Matter-Sidecars

Ist das Matter-Plugin installiert, liegt die Matter-Fabric im **eigenen Speicher-Volume des Sidecars** (`MATTER_SIDECAR_STORAGE_DIR`), das **nicht** zum Attraccess-Volume gehört. Sichern Sie sie über die verschlüsselten Backups des Matter-Plugins und bewahren Sie den Wiederherstellungsschlüssel außerhalb des Servers auf. Siehe [Matter: Backup und Wiederherstellung](plugins/matter/backup-restore.md).

## Tipps

- Sichern Sie Backups auf einem separaten Server oder Cloud-Speicher
- Testen Sie die Wiederherstellung regelmäßig, auf einem Ersatzrechner
- Bewahren Sie die `.env`-Datei separat auf – sie ist nicht im Storage-Volume enthalten

## Siehe auch

- [Matter: Backup und Wiederherstellung](plugins/matter/backup-restore.md)
- [Aktualisierung](installation/updating.md)
- [Docker Compose Installation](installation/docker-compose.md)
