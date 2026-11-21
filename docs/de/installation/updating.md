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
> werden. Lesegeräte, die sich noch mit einem Token anmelden, lassen sich nicht per Funk aktualisieren; flashen
> Sie sie zuerst per USB mit dem Web-Flasher auf Firmware 2.6.0. Siehe
> [Nach dem Upgrade: jeder Reader koppelt neu](attractap/pairing.md#nach-dem-upgrade-jeder-reader-koppelt-neu).

## Umzug von SQLite auf PostgreSQL

Attraccess läuft jetzt ausschließlich auf PostgreSQL. Das ist ein Breaking Change und erscheint in einem Major-Release. Installationen früherer Versionen, die ihre Daten in `<STORAGE_ROOT>/attraccess.sqlite` gespeichert haben, übernehmen ihre Daten beim ersten Start automatisch.

### Vor dem Upgrade

1. Erstellen Sie ein [Backup](installation/backup-restore.md) des Storage-Volumes (es enthält `attraccess.sqlite`). Der erste Start migriert die SQLite-Datei an Ort und Stelle; dieses Backup ist deshalb die einzige unveränderte Kopie.
2. **Fügen Sie einen PostgreSQL-Dienst hinzu** und lassen Sie `DATABASE_URL` auf eine **leere** Datenbank zeigen. Die mitgelieferten Compose-Dateien (Docker Compose, Portainer, Coolify, balena) enthalten bereits einen (`postgres:18.6-alpine`, nicht Teil des Attraccess-Images); siehe [Docker Compose](installation/docker-compose.md) und [Portainer](installation/portainer.md). Haben Sie Attraccess mit einem einfachen `docker run` gestartet, müssen Sie einen PostgreSQL-Container starten und `DATABASE_URL` setzen, **bevor** Sie das neue Image laden, denn die neue Version startet ohne beides nicht.
3. Planen Sie Speicherplatz ein: Die alte SQLite-Datei bleibt nach dem Import auf dem Datenträger (siehe unten), neben den neuen PostgreSQL-Daten.
4. Notieren Sie, wie Ihre Plugins eingerichtet sind. Plugin-Daten werden nicht übernommen (siehe [Plugin-Daten werden nicht übernommen](#plugin-daten-werden-nicht-übernommen)).
5. **balena:** Der Stack enthält kein Duplicati mehr; seine Backup-Jobs entfallen. Erstellen Sie vor dem Upgrade ein letztes Duplicati-Backup und setzen Sie danach die `BACKUP_*`-Variablen des neuen [restic-Sidecars](installation/backup-restore.md#balena-restic-sidecar).

Setzen Sie nicht `DATABASE_TYPE=sqlite`: Der Start schlägt dann mit einer Meldung fehl, die auf diese Seite verweist.

### Was beim ersten Start passiert

Bei jedem Start wartet Attraccess auf PostgreSQL und wendet die ausstehenden Datenbankmigrationen an, **bevor** es die Lizenz prüft, Plugins startet, HTTP-Anfragen annimmt oder mit Geräten spricht. Beim ersten Start von 2.0 sind das:

1. Die Baseline-Migration legt das PostgreSQL-Schema an, gleich dem letzten SQLite-Schema.
2. Die Import-Migration sucht `<STORAGE_ROOT>/attraccess.sqlite`. Ohne die Datei tut sie nichts (eine neue Installation). Mit der Datei wendet sie zuerst die veröffentlichten SQLite-Migrationen **auf die Datei selbst** an; die Datei wird also an Ort und Stelle verändert.
3. Sie kopiert jede Kerntabelle in **einer Transaktion** nach PostgreSQL. Bezeichner und Sequenzen bleiben erhalten (neue Bezeichner setzen nach dem höchsten fort, den SQLite je vergeben hat), Zeitpunkte werden als UTC gespeichert (eine Zeit ohne Offset gilt als UTC), Dezimalwerte bleiben exakt, JSON bleibt erhalten, und Guthaben werden so übernommen, wie sie sind, nicht doppelt angewendet. Fremdschlüssel werden vor dem Commit geprüft.
4. Nach dem Commit wird die SQLite-Datei beiseitegelegt (siehe unten). Spätere Migrationen, etwa die globalen Formulare, laufen danach wie bei jeder anderen Installation auf den importierten Daten.

Die Import-Migration läuft nur einmal. Große Installationen brauchen beim ersten Start länger.

### Wohin die SQLite-Datei kommt

Nach einem erfolgreichen Import werden die SQLite-Datei und ihre `-wal`-, `-shm`- und `-journal`-Dateien nach `<STORAGE_ROOT>/sqlite-backup/` verschoben. Eine vorhandene Datei wird nie überschrieben: Existiert `sqlite-backup/attraccess.sqlite` bereits, erhält die neue Datei einen UTC-Zeitstempel im Namen, etwa `attraccess-20261121T093000123Z.sqlite`.

Attraccess **bewahrt die Datei auf und löscht sie nie**. Löschen Sie sie selbst, sobald Sie die Installation geprüft und ein PostgreSQL-Backup haben.

### Plugin-Daten werden nicht übernommen

Der Import kopiert nur die Kerntabellen. Tabellen, für die PostgreSQL keine Tabelle hat, also die Tabellen der Plugins, ihre `plugin_migrations_*`-Tabellen und die Verwaltungsdaten des Plugin-Speichers, werden nicht kopiert. Ihre Namen werden einmal als Warnung protokolliert, die auch die Backup-Datei nennt.

Plugins starten auf PostgreSQL deshalb mit leerem Speicher. Installieren Sie ihre 2.0-Builds wie gewohnt und richten Sie sie neu ein; für 1.x gebaute Plugins laden unter 2.0 nicht (siehe [Upgrade auf Attraccess 2.0](plugins/installing-plugins.md#upgrade-auf-attraccess-20)). Die alten Plugin-Daten liegen nur noch in der Backup-Datei.

### Fehler und Wiederholung

Schlägt der Import vor dem Commit fehl, wird nichts importiert, die SQLite-Datei bleibt, wo sie ist, und die API beendet sich mit einer Fehlermeldung. Eine Zeile, die sich nicht speichern lässt (ein ungültiger Zeitpunkt, ein gebrochener Fremdschlüssel, eine verletzte Constraint), lässt den gesamten Import scheitern; die Meldung nennt die Tabelle, den Zeilenschlüssel oder die Constraint und die betroffenen Schlüssel. Beheben Sie die Ursache und starten Sie erneut: Der nächste Start wiederholt den Import. Die Datei steht dann womöglich schon auf dem letzten SQLite-Schema; das ist unschädlich. Jede Migration läuft in ihrer eigenen Transaktion, die Baseline bleibt also angewendet; der Import leert die Startdaten der Baseline, bevor er kopiert.

- **PostgreSQL enthält bereits Benutzer und die SQLite-Datei ist vorhanden.** Der Start schlägt mit einer Fehlermeldung fehl, die die Datei nennt, und nichts wird verändert. Leeren Sie entweder die PostgreSQL-Datenbank (löschen und neu anlegen) und starten Sie erneut, oder verschieben Sie die SQLite-Datei aus dem Storage-Ordner, wenn PostgreSQL Ihre Daten bereits enthält.
- **Zwei Instanzen starten gleichzeitig.** Die Migrationen laufen unter einem PostgreSQL-Advisory-Lock: Eine Instanz führt sie aus, die andere wartet und findet danach nichts mehr zu tun.
- **Das Verschieben der Datei schlägt nach dem Commit fehl** (etwa auf einem schreibgeschützten Storage-Volume). Attraccess protokolliert eine Warnung und startet trotzdem: Die Daten liegen bereits in PostgreSQL, und der Import gilt als erledigt, er läuft also nie wieder. Verschieben oder löschen Sie `attraccess.sqlite` selbst.

### Logzeilen, auf die Sie achten sollten

Verfolgen Sie den Start mit `docker compose logs -f attraccess`. Der Import protokolliert unter `SqliteImport` (englische Meldungen):

```text
Importing the SQLite database <file> into PostgreSQL...
Brought the SQLite file to the last SQLite migration (N migration(s) applied).
SQLite import complete: <rows> rows in <n> tables; the SQLite file is now <path>.
  <table>: <rows>
Not imported (plugin data and other tables PostgreSQL has no table for): ...
```

Auf die Abschlusszeile folgt eine Zeile je Tabelle. Davor protokolliert `DatabaseStartup` die Zeile `Database: PostgreSQL <url> (schema ...)`, mit entferntem Passwort in der URL.

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
