# Aktualisierung

<!-- llms-description: So prüfen und installieren Sie Attraccess-Updates mit Docker Compose, Docker oder Portainer, legen eine feste Version fest und ziehen eine 1.x-Installation von SQLite auf PostgreSQL um. -->

So aktualisieren Sie Attraccess auf die neueste Version.

## Prüfen, ob eine neue Version verfügbar ist

Wenn Sie die Berechtigung **Systemkonfiguration verwalten** besitzen, zeigt Attraccess oben auf jeder Seite ein Banner an, sobald eine neuere Version auf GitHub verfügbar ist. Das Banner verlinkt auf:

- Die vollständigen Release-Notes der neuen Version
- Diese Update-Anleitung

Sie können den Stand auch jederzeit manuell prüfen, indem Sie Ihre laufende Version (abrufbar unter `GET /api/version`) mit der [GitHub-Releases-Seite](https://github.com/Attraccess/Attraccess/releases) vergleichen.

## Vor der Aktualisierung

> [!TIP]
> Erstellen Sie vor jeder Aktualisierung ein [Backup](installation/backup-restore.md) Ihrer Daten.

Überprüfen Sie die [Release-Notes](https://github.com/Attraccess/Attraccess/releases) auf Breaking Changes, bevor Sie aktualisieren.

> [!WARNING]
> **Attractap-Lesegeräte koppeln nach dem Release, das die Token-Anmeldung entfernt (Attractap-Firmware 2.6.0), neu.**
> Sein erster Start löscht alle Einträge der Lesegeräte, samt Namen, Ressourcen-Verknüpfungen, Einstellungen
> pro Lesegerät und der Auswahl der Lesegeräte für das Schreiben von Karten. Jedes Lesegerät muss neu gekoppelt
> werden. Lesegeräte, die sich noch mit einem Token anmelden, aktualisieren sich zuerst per Funk und zeigen dann
> ihren Kopplungscode. Siehe
> [Nach dem Upgrade: jeder Reader koppelt neu](attractap/pairing.md#nach-dem-upgrade-jeder-reader-koppelt-neu).

## Umzug von SQLite auf PostgreSQL

Attraccess läuft jetzt ausschließlich auf PostgreSQL. Das ist ein Breaking Change und erscheint in einem Major-Release. Installationen früherer Versionen, die ihre Daten in `<STORAGE_ROOT>/attraccess.sqlite` gespeichert haben, übernehmen ihre Daten beim ersten Start automatisch.

### Vor dem Upgrade

1. **Stoppen Sie die alte Instanz** (jeden Container, der das Storage-Volume nutzt) und erstellen Sie ein [Backup](installation/backup-restore.md) des Storage-Volumes (es enthält `attraccess.sqlite`). Der erste Start migriert die SQLite-Datei an Ort und Stelle; dieses Backup ist deshalb die einzige unveränderte Kopie. Eine 1.x-Instanz, die weiterläuft, würde in eine Datei schreiben, die bereits kopiert wurde.
2. **Fügen Sie einen PostgreSQL-Dienst hinzu** und lassen Sie `DATABASE_URL` auf eine **leere** Datenbank zeigen. Die mitgelieferten Compose-Dateien (Docker Compose, Portainer, Coolify, balena) enthalten bereits einen (`postgres:18.6-alpine`, nicht Teil des Attraccess-Images); siehe [Docker Compose](installation/docker-compose.md) und [Portainer](installation/portainer.md). Haben Sie Attraccess mit einem einfachen `docker run` gestartet, müssen Sie einen PostgreSQL-Container starten und `DATABASE_URL` setzen, **bevor** Sie das neue Image laden, denn die neue Version startet ohne beides nicht.
3. Planen Sie Speicherplatz ein: Die alte SQLite-Datei bleibt nach dem Import auf dem Datenträger (siehe unten), neben den neuen PostgreSQL-Daten. Der Storage-Ordner und die SQLite-Datei müssen für den Attraccess-Container beschreibbar sein, denn die Datei wird an Ort und Stelle migriert und danach verschoben. Braucht die Datei noch SQLite-Migrationen, beendet eine schreibgeschützte Datei den Start, bevor etwas importiert wird (`attempt to write a readonly database`); andernfalls läuft der Import durch und nur das Verschieben schlägt fehl (siehe [Fehler und Wiederholung](#fehler-und-wiederholung)).
4. Notieren Sie, wie Ihre Plugins eingerichtet sind. Plugin-Daten werden nicht übernommen (siehe [Plugin-Daten werden nicht übernommen](#plugin-daten-werden-nicht-übernommen)).
5. **balena:** Das Update entfernt Duplicati samt seinen Backup-Jobs, und Attraccess startet erst, wenn der neue [restic-Sidecar](installation/backup-restore.md#balena-restic-sidecar) eingerichtet ist. Übernehmen Sie die Duplicati-Einstellungen und setzen Sie die neuen Variablen **vor** dem Update, wie in [balena: von Duplicati zum restic-Sidecar](#balena-von-duplicati-zum-restic-sidecar) beschrieben.

Setzen Sie nicht `DATABASE_TYPE=sqlite`: Der Start schlägt dann mit einer Meldung fehl, die auf diese Seite verweist.

### balena: von Duplicati zum restic-Sidecar

Frühere balena-Releases sicherten mit Duplicati, das Sie in seiner Weboberfläche eingerichtet haben. Das neue Release enthält kein Duplicati: Das Update entfernt den Dienst, seine Backup-Jobs und die dort eingegebenen Einstellungen. An seine Stelle tritt der neue Dienst `backup` (restic), den Sie über Gerätevariablen einrichten. Er **startet nicht ohne seine Einstellungen, und Attraccess wartet auf ihn**: Ein Gerät ohne Backup bleibt nicht unbemerkt. Lesen Sie die Duplicati-Einstellungen aus, solange Duplicati noch läuft, und setzen Sie die neuen Variablen vor dem Update.

**1. Duplicati-Einstellungen auslesen (altes Release, vor dem Update).** Öffnen Sie die Duplicati-Weboberfläche wie bisher (Port `8200` des Dienstes `duplicati`, meist über einen Proxy-Host im Nginx Proxy Manager). Wählen Sie für jeden Backup-Job **Export**, dann **Als Kommandozeile**, und setzen Sie den Haken bei **Exportiere Passwörter**. Bewahren Sie das Ergebnis in einem Passwortmanager auf. Der Befehl enthält die Ziel-URL mit ihren Optionen, `--passphrase` und `--retention-policy`; der Zeitplan gehört nicht dazu, notieren Sie ihn daher zusätzlich von der Zeitplan-Seite des Jobs. Verwenden Sie die Werte so (Wert im Duplicati-Export → Einstellung des Sidecars):

- Ziel-URL `s3://<bucket>/<ordner>?s3-server-name=<server>&…` → `BACKUP_REPOSITORY=s3:https://<server>/<bucket>/<neuer ordner>` (mit `use-ssl=false`: `s3:http://…`; Amazon S3: `s3:s3.amazonaws.com/<bucket>/<neuer ordner>`)
- `auth-username` (oder `aws-access-key-id`) → `AWS_ACCESS_KEY_ID`
- `auth-password` (oder `aws-secret-access-key`) → `AWS_SECRET_ACCESS_KEY`
- `s3-location-constraint` (Region), falls gesetzt → `AWS_DEFAULT_REGION`
- Ziel-URL `b2://<bucket>/<ordner>?auth-username=<key id>&auth-password=…` (oder `b2-accountid`, `b2-applicationkey`) → `BACKUP_REPOSITORY=b2:<bucket>:<neuer ordner>`, `B2_ACCOUNT_ID=<key id>`, `B2_ACCOUNT_KEY=<application key>`
- `--passphrase` → Nicht übertragbar: restic legt ein neues Repository an. Wählen Sie ein neues `BACKUP_PASSWORD` und **behalten Sie die Duplicati-Passphrase** für die alten Backups.
- Zeitplan-Seite des Jobs (z. B. täglich um 03:00 Uhr; nicht im Export) → `BACKUP_SCHEDULE` (Cron mit 5 Feldern, `0 3 * * *` ist der Standard)
- `--retention-policy` (z. B. „intelligent" = `1W:1D,4W:1W,12M:1M`) → `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY` (für „intelligent": `7`, `4`, `12`)

Nutzen Sie für das restic-Repository einen **neuen Ordner**, nicht den Ordner der Duplicati-Dateien: Die beiden Formate dürfen sich nicht mischen, und die alten Duplicati-Backups bleiben daneben lesbar. Der Sidecar sichert dieselben Volumes, die in den mitgelieferten Dienst `duplicati` eingebunden waren, und zusätzlich einen Dump der PostgreSQL-Datenbank; weitere Ordner, die Sie Ihrem Duplicati-Job hinzugefügt haben, werden nicht übernommen. Andere Duplicati-Ziele (SFTP, WebDAV, …) entsprechen [restic-Repositories](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html); prüfen Sie vor dem Update, dass der Sidecar sie erreicht.

**2. Die neuen Variablen setzen, noch auf dem alten Release.** Setzen Sie `BACKUP_REPOSITORY`, `BACKUP_PASSWORD`, die Zugangsdaten (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, …) und bei Bedarf `BACKUP_SCHEDULE` und `BACKUP_KEEP_*` als **Gerätevariablen** (nicht als Flottenvariablen, siehe [restic-Sidecar](installation/backup-restore.md#balena-restic-sidecar)). Den Dienst `backup` gibt es noch nicht, daher können es keine Dienstvariablen sein; balena startet die laufenden Dienste einmal neu, um sie zu übernehmen, was nicht schadet. Muss das Gerät vorerst ohne Backup laufen, setzen Sie stattdessen `BACKUP_DISABLED=true`: Attraccess startet dann und protokolliert eine Warnung.

**3. Ein letztes Duplicati-Backup erstellen.** Sobald balena die Variablen übernommen hat, stoppen Sie den Dienst `attraccess` im balena-Dashboard (Schritt 1 von [Vor dem Upgrade](#vor-dem-upgrade)): Ihn vor Schritt 2 zu stoppen reicht nicht, denn das Übernehmen der Variablen kann ihn wieder starten. Starten Sie den Job auf der Startseite von Duplicati mit seiner Schaltfläche **Start** und warten Sie, bis er erfolgreich ist. Dieses Backup enthält die unveränderte `attraccess.sqlite`. Lassen Sie `attraccess` bis zum Update gestoppt.

**4. Aktualisieren Sie das Gerät** auf das neue Release.

**5. Den Sidecar prüfen.** Sein Log zeigt `backups enabled: schedule …`, und Attraccess startet. Der Start prüft nur die Einstellungen selbst (vorhanden und gültig), nicht, ob das Ziel funktioniert; führen Sie daher gleich ein erstes Backup aus und listen Sie es auf:

```bash
balena-engine exec -it <backup-container> attraccess-backup backup
balena-engine exec -it <backup-container> attraccess-backup snapshots
```

Protokolliert der Dienst `attraccess` stattdessen `waiting for the backup service`, nennt das Log des Dienstes `backup` die fehlende oder ungültige Einstellung. Korrigieren Sie die Variable; die Dienste starten neu, und Attraccess startet von selbst. Endet das Backup selbst mit `BACKUP FAILED`, nennen die Zeilen davor die Ursache (Adresse, Zugangsdaten, ein falsches Passwort für ein bestehendes Repository); bis zum nächsten erfolgreichen Lauf löst der Alarm [`BackupFailed`](monitoring/prometheus-grafana.md#backup-alarme) aus.

**6. Behalten Sie die alten Duplicati-Backups**, bis die restic-Snapshots weit genug zurückreichen. Um eines davon später wiederherzustellen, installieren Sie Duplicati an beliebiger Stelle (zum Beispiel auf einem Laptop), öffnen **Wiederherstellungen** und wählen **Direkte Wiederherstellung aus Sicherungsdateien** und geben Ziel-URL und Passphrase aus Schritt 1 ein. Löschen Sie danach den Duplicati-Ordner im Bucket.

Wurde das Gerät schon ohne Schritt 1 aktualisiert, sind die Duplicati-Einstellungen mit dem Dienst verschwunden; entnehmen Sie Adresse und Zugangsdaten des Ziels dann Ihrem Speicheranbieter.

### Was beim ersten Start passiert

Bei jedem Start wartet Attraccess auf PostgreSQL und wendet die ausstehenden Datenbankmigrationen an, **bevor** es die Lizenz prüft, Plugins startet, HTTP-Anfragen annimmt oder mit Geräten spricht. Beim ersten Start von 2.0 sind das:

1. Die Baseline-Migration legt das PostgreSQL-Schema an, das dem letzten SQLite-Schema entspricht.
2. Die Import-Migration sucht nach `<STORAGE_ROOT>/attraccess.sqlite`. Ohne die Datei tut sie nichts (eine neue Installation) und protokolliert `No SQLite file at <file>: nothing to import.` Prüfen Sie diese Zeile, wenn Sie einen Import erwartet haben: Der Import läuft nur einmal, ein erster Start ohne die Datei (Volume nicht eingebunden, anderes `STORAGE_ROOT`) hinterlässt also eine leere Installation. Mit der Datei wendet sie zuerst die veröffentlichten SQLite-Migrationen **auf die Datei selbst** an; die Datei wird also an Ort und Stelle verändert.
3. Sie kopiert jede Kerntabelle in **einer Transaktion** nach PostgreSQL. IDs und Sequenzen bleiben erhalten (neue IDs schließen an die höchste an, die SQLite je vergeben hat), Zeitpunkte werden als UTC gespeichert (eine Zeit ohne Offset gilt als UTC), Dezimalwerte bleiben exakt, JSON bleibt erhalten, und Guthaben werden unverändert übernommen und nicht doppelt verbucht. Fremdschlüssel werden vor dem Commit geprüft.
4. Nach dem Commit wird die SQLite-Datei beiseitegelegt (siehe unten). Spätere Migrationen, etwa die globalen Formulare, laufen danach wie bei jeder anderen Installation auf den importierten Daten.

Die Import-Migration läuft nur einmal. Große Installationen brauchen beim ersten Start länger.

### Wohin die SQLite-Datei kommt

Nach einem erfolgreichen Import werden die SQLite-Datei und ihre `-wal`-, `-shm`- und `-journal`-Dateien nach `<STORAGE_ROOT>/sqlite-backup/` verschoben. Eine vorhandene Datei wird nie überschrieben: Existiert `sqlite-backup/attraccess.sqlite` bereits, erhält die neue Datei einen UTC-Zeitstempel im Namen, etwa `attraccess-20261121T093000123Z.sqlite`.

Attraccess **bewahrt die Datei auf und löscht sie nie**. Löschen Sie sie selbst, sobald Sie die Installation geprüft und ein PostgreSQL-Backup haben. Die Datei in `sqlite-backup/` ist die migrierte Datei, nicht das Original: Um zu 1.x zurückzukehren, spielen Sie das Backup des Storage-Volumes ein, das Sie vor dem Upgrade erstellt haben.

### Plugin-Daten werden nicht übernommen

Der Import kopiert nur die Kerntabellen. Tabellen, für die PostgreSQL keine Tabelle hat, also die Tabellen der Plugins, ihre `plugin_migrations_*`-Tabellen und die Verwaltungsdaten des Plugin-Speichers, werden nicht kopiert. Ihre Namen werden einmal als Warnung protokolliert, die auch die Backup-Datei nennt.

Plugins starten auf PostgreSQL deshalb mit leerem Speicher. Installieren Sie ihre 2.0-Builds wie gewohnt und richten Sie sie neu ein; für 1.x gebaute Plugins laden unter 2.0 nicht (siehe [Upgrade auf Attraccess 2.0](plugins/installing-plugins.md#upgrade-auf-attraccess-20)). Die alten Plugin-Daten liegen in der Backup-Datei (und in Ihrem Backup von vor dem Upgrade).

### Fehler und Wiederholung

Schlägt der Import vor dem Commit fehl, wird nichts importiert, die SQLite-Datei bleibt, wo sie ist, und die API beendet sich mit einer Fehlermeldung. Eine Zeile, die sich nicht speichern lässt (ein ungültiger Zeitpunkt, ein gebrochener Fremdschlüssel, eine verletzte Integritätsbedingung), lässt den gesamten Import scheitern; die Meldung nennt die Tabelle, die Zeile (über ihren Schlüssel) und die Spalte oder Integritätsbedingung; ein gebrochener Fremdschlüssel nennt die Bedingung und bis zu fünf betroffene Schlüssel. Andere Werte der Zeile werden nie angezeigt. Korrigieren oder löschen Sie die Zeile in `attraccess.sqlite` (etwa mit dem Werkzeug `sqlite3`, zuerst an einer Kopie) oder melden Sie die Meldung auf GitHub, und starten Sie dann erneut: Der nächste Start wiederholt den Import. Die Datei steht dann womöglich schon auf dem letzten SQLite-Schema; das ist unschädlich. Jede Migration läuft in ihrer eigenen Transaktion, die Baseline bleibt also angewendet; der Import leert die Ausgangsdaten (Seed-Daten) der Baseline, bevor er kopiert.

- **PostgreSQL enthält bereits Benutzer und die SQLite-Datei ist vorhanden.** Der Start schlägt mit einer Fehlermeldung fehl, die die Datei nennt, und nichts wird verändert. Leeren Sie entweder die PostgreSQL-Datenbank (die Datenbank oder ihr Schema löschen und neu anlegen) und starten Sie erneut, oder verschieben Sie die SQLite-Datei aus dem Storage-Ordner, wenn PostgreSQL Ihre Daten bereits enthält. Das passiert auch, wenn ein früherer Start die Datei importiert, aber vor dem Verschieben angehalten hat (das Log zeigt dann `Copied <rows> rows into PostgreSQL (committed).`): PostgreSQL enthält Ihre Daten, verschieben Sie die Datei also nach `<STORAGE_ROOT>/sqlite-backup/`.
- **Zwei Instanzen starten gleichzeitig.** Die Migrationen laufen unter einem PostgreSQL-Advisory-Lock: Eine Instanz führt sie aus, die andere protokolliert `Waiting for another instance to finish the database migrations...`, wartet und findet danach nichts mehr zu tun.
- **Das Verschieben der Datei schlägt nach dem Commit fehl** (etwa weil eine Datei namens `sqlite-backup` im Weg ist). Attraccess protokolliert eine Warnung und startet trotzdem: Die Daten liegen bereits in PostgreSQL, und der Import gilt als erledigt, er läuft also nie wieder. Verschieben oder löschen Sie `attraccess.sqlite` (und ihre `-wal`-, `-shm`- und `-journal`-Dateien) selbst.

### Logzeilen, auf die Sie achten sollten

Verfolgen Sie den Start mit `docker compose logs -f attraccess`. Der Import protokolliert unter `SqliteImport` (englische Meldungen):

```text
Importing the SQLite database <file> into PostgreSQL...
Brought the SQLite file to the last SQLite migration (N migration(s) applied).
Copied <rows> rows into PostgreSQL (committed).
SQLite import complete: <rows> rows in <n> tables; the SQLite file is at <path>.
  <table>: <rows>
Not imported (plugin data and other tables PostgreSQL has no table for): ...
```

Auf die Abschlusszeile folgt eine Zeile je Tabelle. Davor protokolliert `DatabaseStartup` die Zeile `Database: PostgreSQL <url> (schema ...)`, ohne das Passwort in der URL.

## Docker Compose

```bash
cd /pfad/zu/attraccess

# Neuestes Image herunterladen
docker compose pull

# Container mit neuem Image neustarten
docker compose up -d
```

Attraccess führt Datenbankmigrationen automatisch beim Start durch. Innerhalb einer Hauptversion sind keine manuellen
Schritte nötig. Das Upgrade von 1.x braucht zusätzliche Schritte, siehe
[Umzug von SQLite auf PostgreSQL](#umzug-von-sqlite-auf-postgresql).

## Klassisches Docker

```bash
# Laufenden Container stoppen und entfernen (Volumes bleiben erhalten)
docker stop attraccess && docker rm attraccess

# Neuestes Image von Docker Hub oder GHCR laden
docker pull attraccess/attraccess:latest
# oder:
docker pull ghcr.io/attraccess/attraccess:latest

# Container mit den gleichen Volumes/Umgebungsvariablen neu erstellen, plus DATABASE_URL eines
# zuvor gestarteten PostgreSQL-Dienstes (siehe "Umzug von SQLite auf PostgreSQL")
docker run -d --name attraccess ... attraccess/attraccess:latest
```

## Portainer

1. Öffnen Sie Portainer
2. Navigieren Sie zu **Stacks** → `attraccess`
3. Klicken Sie auf **Pull and redeploy**
4. Bestätigen Sie die Aktion

## Eine feste Version festlegen

Standardmäßig verweist der Tag `latest` auf den neuesten Release. Um eine feste Version zu verwenden, ersetzen Sie `latest` in Ihrer `docker-compose.yml` durch den gewünschten SemVer-Tag (z. B. `v0.1.2`):

```yaml
services:
  attraccess:
    image: attraccess/attraccess:v0.1.2
```

Anschließend mit `docker compose up -d` anwenden.

## Fehlerbehebung

Falls nach einer Aktualisierung Probleme auftreten:

1. Prüfen Sie die Logs:
   ```bash
   docker compose logs -f attraccess
   ```
2. Stellen Sie bei Bedarf ein [Backup](installation/backup-restore.md) wieder her
3. Melden Sie Probleme auf [GitHub](https://github.com/Attraccess/Attraccess/issues)

## Siehe auch

- [Backup & Wiederherstellung](installation/backup-restore.md)
- [Häufige Probleme](faq/common-issues.md)
