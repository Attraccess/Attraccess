# Aktualisierung

<!-- llms-description: So prüfen Sie auf neue Attraccess-Versionen und aktualisieren mit Docker Compose, Docker oder Portainer, legen eine feste Version fest gehen über 1.11 auf 2.0 und wechseln von SQLite auf PostgreSQL. -->

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

## Umzug von SQLite auf PostgreSQL

Attraccess läuft jetzt ausschließlich auf PostgreSQL. Das ist eine Breaking Change und erscheint in einem Major-Release. Installationen früherer Versionen, die ihre Daten in `<STORAGE_ROOT>/attraccess.sqlite` gespeichert haben, übernehmen ihre Daten beim ersten Start automatisch.

### Vor dem Upgrade

1. Erstellen Sie ein [Backup](installation/backup-restore.md) des Storage-Volumes (es enthält `attraccess.sqlite`).
2. **Fügen Sie einen PostgreSQL-Dienst hinzu** und lassen Sie `DATABASE_URL` auf eine leere Datenbank zeigen. Die mitgelieferten Compose-Dateien (Docker Compose, Portainer, Coolify, balena) enthalten bereits einen (`postgres:18.6-alpine`, nicht Teil des Attraccess-Images); siehe [Docker Compose](installation/docker-compose.md) und [Portainer](installation/portainer.md). Haben Sie Attraccess mit einem einfachen `docker run` gestartet, müssen Sie einen PostgreSQL-Container starten und `DATABASE_URL` setzen, **bevor** Sie das neue Image laden, denn die neue Version startet ohne beides nicht.
3. Stellen Sie sicher, dass alle Plugins mit Daten in `<STORAGE_ROOT>/plugins` installiert sind und geladen werden können (siehe [Plugins installieren](plugins/installing-plugins.md)).
4. Planen Sie Speicherplatz ein: Die alte SQLite-Datei bleibt nach der Übernahme auf dem Datenträger (siehe unten), neben den neuen PostgreSQL-Daten.

Setzen Sie nicht `DATABASE_TYPE=sqlite`: Der Start schlägt dann mit einer Meldung fehl, die auf diese Seite verweist.

### Was beim ersten Start passiert

Enthält das Storage-Verzeichnis `attraccess.sqlite` und ist die PostgreSQL-Datenbank leer, übernimmt Attraccess die Daten, **bevor** es Migrationen ausliefert, Plugins startet, HTTP öffnet oder mit Geräten spricht:

1. Die SQLite-Datei (mit ihren `-wal`- und `-shm`-Dateien) wird in eine temporäre Arbeitskopie kopiert. **Das Original wird nie verändert.** Jede unterstützte ältere Version funktioniert als Quelle: Eine eingefrorene Kopie der alten SQLite-Migrationen bringt die Arbeitskopie zunächst auf das letzte SQLite-Schema.
2. Die Daten, einschließlich der Tabellen installierter Plugins und ihrer Storage-Versionen, werden in einen neutralen Snapshot gelesen.
3. Der Snapshot wird in **einer Transaktion** in PostgreSQL importiert. Bezeichner und Sequenzen, UTC-Zeitpunkte und exakte Dezimalwerte bleiben erhalten, und Guthaben werden nicht doppelt angewendet. Integritätsprüfungen laufen, bevor die Transaktion abgeschlossen wird.
4. Bei Erfolg wird die Datei in `attraccess.sqlite.migrated-to-postgres-<Zeitstempel>` umbenannt, und das Log zeigt die Zeilenzahl je Tabelle. Die umbenannte Datei wird von Attraccess **aufbewahrt und nie gelöscht**; löschen Sie sie selbst, sobald Sie die Installation geprüft und ein PostgreSQL-Backup haben. Der nächste Start übernimmt nicht erneut.

Die Logzeilen stammen von `SqliteTransfer`; verfolgen Sie sie mit `docker compose logs -f attraccess`. Große Installationen brauchen beim ersten Start länger.

### Fehler und Wiederholung

Schlägt etwas fehl, wird die PostgreSQL-Transaktion zurückgerollt, die SQLite-Datei bleibt unberührt, und die API beendet sich mit einer klaren Fehlermeldung und einem Link auf diese Seite. Beheben Sie die Ursache und starten Sie erneut: Der nächste Start wiederholt die Übernahme von vorn.

- **Ein Plugin fehlt.** Ein Plugin, das Daten in der SQLite-Datei hat, aber nicht installiert ist, stoppt die Übernahme mit einer klaren Fehlermeldung, und nichts wird importiert. Installieren Sie das Plugin (seinen 2.0-Build, siehe [Upgrade auf Attraccess 2.0](#upgrade-auf-attraccess-20)) und starten Sie erneut.
- **Zwei Instanzen starten gleichzeitig.** Eine PostgreSQL-Advisory-Lock stellt sicher, dass nur eine übernimmt; die andere wartet.
- **PostgreSQL enthält bereits Daten.** Ist die Datenbank nicht leer und die SQLite-Datei noch vorhanden, protokolliert Attraccess eine Warnung und übernimmt nichts. Nutzen Sie den manuellen Befehl unten, wenn Sie die Daten ersetzen wollen.

### Übernahme manuell ausführen

Führen Sie sie im Container aus (die API darf nicht gegen dieselbe Datenbank laufen):

```bash
docker compose run --rm attraccess node dist/apps/api/main.js transfer-sqlite [--sqlite <Pfad>] [--force] [--keep]
```

| Option            | Bedeutung                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `--sqlite <Pfad>` | Die SQLite-Datei; Standard `<STORAGE_ROOT>/attraccess.sqlite`                                   |
| `--force`         | Ersetzt Daten, die schon in der PostgreSQL-Datenbank liegen. Ohne sie wird ein nicht leeres Ziel abgelehnt |
| `--keep`          | Benennt die SQLite-Datei nach erfolgreicher Übernahme nicht um                                  |

In einem Entwicklungs-Checkout lautet das Gegenstück `pnpm nx run api:transfer-sqlite -- --sqlite <Pfad>`.

## Upgrade auf Attraccess 2.0

Attraccess 2.0 übernimmt die Daten von Plugins (WAGO, Matter, Shelly, Reservierungen und andere) nur vom letzten
1.x-Release, **Attraccess 1.11**. Aktualisieren Sie in zwei Schritten:

1. Erstellen Sie ein [Backup](installation/backup-restore.md).
2. Aktualisieren Sie auf Attraccess 1.11 (fixieren Sie das neueste `v1.11.x`-Tag, siehe
   [Eine feste Version festlegen](#eine-feste-version-festlegen)) und starten Sie es **einmal**, damit jedes Plugin seine
   Migrationen abschließt. Prüfen Sie unter **Einstellungen → Plugins**, dass alle Plugins laden.
3. Erstellen Sie ein weiteres Backup und aktualisieren Sie dann auf 2.0.

Überspringen Sie Schritt 2, etwa von 1.10 aus, lehnt Attraccess 2.0 jedes betroffene Plugin mit einer (englischen)
Meldung ab: Attraccess 2.0 übernehme die Daten des Plugins nur vom letzten 1.x-Release (1.11); spielen Sie das Backup
von vor dem Upgrade zurück, aktualisieren Sie auf Attraccess 1.11, starten Sie es einmal und aktualisieren Sie dann auf
2.0. In diesem Fall wurde nichts geändert: Folgen Sie der Meldung.

Für 1.x gebaute Plugins laden unter 2.0 gar nicht; installieren Sie deren 2.0-Builds (siehe
[Upgrade auf Attraccess 2.0](plugins/installing-plugins.md#upgrade-auf-attraccess-20) in der Plugin-Anleitung).

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
[Umzug von SQLite auf PostgreSQL](#umzug-von-sqlite-auf-postgresql) und [Upgrade auf Attraccess 2.0](#upgrade-auf-attraccess-20).

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
