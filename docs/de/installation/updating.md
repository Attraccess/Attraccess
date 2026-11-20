# Aktualisierung

<!-- llms-description: So prüfen Sie auf neue Attraccess-Versionen und aktualisieren mit Docker Compose, Docker oder Portainer, legen eine feste Version fest, gehen über 1.11 auf 2.0 und wechseln von SQLite auf PostgreSQL. -->

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

1. **Seien Sie auf Attraccess 1.11 und starten Sie es einmal** (siehe [Upgrade auf Attraccess 2.0](#upgrade-auf-attraccess-20)). Kommen Sie von einem älteren Release, lehnt die Übernahme Plugin-Daten mit unvollständigem Verlauf ab, und die API startet nicht.
2. Erstellen Sie ein [Backup](installation/backup-restore.md) des Storage-Volumes (es enthält `attraccess.sqlite`).
3. **Fügen Sie einen PostgreSQL-Dienst hinzu** und lassen Sie `DATABASE_URL` auf eine leere Datenbank zeigen. Die mitgelieferten Compose-Dateien (Docker Compose, Portainer, Coolify, balena) enthalten bereits einen (`postgres:18.6-alpine`, nicht Teil des Attraccess-Images); siehe [Docker Compose](installation/docker-compose.md) und [Portainer](installation/portainer.md). Haben Sie Attraccess mit einem einfachen `docker run` gestartet, müssen Sie einen PostgreSQL-Container starten und `DATABASE_URL` setzen, **bevor** Sie das neue Image laden, denn die neue Version startet ohne beides nicht.
4. **Legen Sie den 2.0-Build jedes Plugins mit Daten in den Plugin-Ordner** (`<STORAGE_ROOT>/plugins`), bevor Sie 2.0 zum ersten Mal starten. 2.0 lädt keine 1.x-Builds, und die Übernahme stoppt, wenn die Tabellen eines Plugins Zeilen enthalten, aber kein ladbarer Build davon installiert ist. Attraccess 1.11 kann keine 2.0-Builds installieren; folgen Sie deshalb [Plugins mit Daten](#plugins-mit-daten).
5. Planen Sie Speicherplatz ein: Die alte SQLite-Datei bleibt nach der Übernahme auf dem Datenträger (siehe unten), neben den neuen PostgreSQL-Daten.
6. **balena:** Der Stack enthält kein Duplicati mehr; seine Backup-Jobs entfallen. Erstellen Sie vor dem Upgrade ein letztes Duplicati-Backup und setzen Sie danach die `BACKUP_*`-Variablen des neuen [restic-Sidecars](installation/backup-restore.md#balena-restic-sidecar).

Setzen Sie nicht `DATABASE_TYPE=sqlite`: Der Start schlägt dann mit einer Meldung fehl, die auf diese Seite verweist.

### Was beim ersten Start passiert

Enthält das Storage-Verzeichnis `attraccess.sqlite` und ist die PostgreSQL-Datenbank leer, übernimmt Attraccess die Daten, **bevor** es HTTP-Anfragen annimmt, mit Geräten spricht oder Plugins startet:

1. Die SQLite-Datei (mit ihren `-wal`- und `-shm`-Dateien) wird in eine temporäre Arbeitskopie kopiert. **Das Original wird nie verändert.** Eine eingefrorene Kopie der alten SQLite-Migrationen bringt die Arbeitskopie zunächst auf das letzte SQLite-Schema. Plugin-Daten werden nur von 1.11 übernommen (siehe oben).
2. Die Daten, einschließlich der Tabellen installierter Plugins und ihrer Storage-Versionen, werden in einen neutralen Snapshot gelesen.
3. Der Snapshot wird in **einer Transaktion** in PostgreSQL importiert. Bezeichner und Sequenzen, UTC-Zeitpunkte und exakte Dezimalwerte bleiben erhalten, und Guthaben werden nicht doppelt angewendet. Fremdschlüssel werden innerhalb der Transaktion geprüft; eine Zeile, die auf eine fehlende Zeile verweist, rollt den gesamten Import zurück. Nach dem Commit vergleicht eine Guthabenprüfung die gespeicherten Guthaben mit den Abrechnungsbuchungen; sie protokolliert nur Warnungen (`Integrity check: …`) und macht die Übernahme nicht rückgängig.
4. Bei Erfolg wird die Datei in `attraccess.sqlite.migrated-to-postgres-<Zeitstempel>` umbenannt, und das Log zeigt die Zeilenzahl je Tabelle. Die umbenannte Datei wird von Attraccess **aufbewahrt und nie gelöscht**; löschen Sie sie selbst, sobald Sie die Installation geprüft und ein PostgreSQL-Backup haben. Der nächste Start übernimmt nicht erneut.

Schlägt das Umbenennen nach einer erfolgreichen Übernahme fehl (etwa auf einem schreibgeschützten Storage-Volume), protokolliert die API eine Warnung und startet trotzdem: Die Daten liegen bereits in PostgreSQL. Bei späteren Starts wird die Datei ignoriert, weil PostgreSQL nun Daten enthält. Benennen Sie `attraccess.sqlite` selbst um oder entfernen Sie sie.

Die Logzeilen stammen von `SqliteTransfer`; verfolgen Sie sie mit `docker compose logs -f attraccess`. Große Installationen brauchen beim ersten Start länger.

### Fehler und Wiederholung

Schlägt etwas fehl, wird die PostgreSQL-Transaktion zurückgerollt, die SQLite-Datei bleibt unberührt, und die API beendet sich mit einer klaren Fehlermeldung und einem Link auf diese Seite. Beheben Sie die Ursache und starten Sie erneut: Der nächste Start wiederholt die Übernahme von vorn.

- **Ein Plugin fehlt.** Enthalten Tabellen eines Plugins Zeilen, ist das Plugin aber nicht installiert oder nicht ladbar (etwa ein 1.x-Build), stoppt die Übernahme, und nichts wird importiert. Die Meldung listet jede solche Tabelle mit ihrer Zeilenzahl auf, gruppiert nach Plugin. Legen Sie den 2.0-Build jedes genannten Plugins in den Plugin-Ordner (siehe [Plugins mit Daten](#plugins-mit-daten)) und starten Sie erneut. Leere Tabellen eines nicht installierten Plugins werden mit einer Warnung übersprungen.
- **Plugin-Daten von vor 1.11.** Die Übernahme lehnt Plugin-Daten ab, deren 1.x-Migrationen nur teilweise angewendet sind, und die API startet nicht. Die SQLite-Datei bleibt unberührt: Wechseln Sie zurück zum 1.11-Image, starten Sie es einmal und starten Sie dann erneut 2.0.
- **Zwei Instanzen starten gleichzeitig.** Ein PostgreSQL-Advisory-Lock stellt sicher, dass nur eine übernimmt; die andere wartet.
- **PostgreSQL enthält bereits Daten.** Ist die Datenbank nicht leer und die SQLite-Datei noch vorhanden, protokolliert Attraccess eine Warnung und übernimmt nichts. Nutzen Sie den manuellen Befehl unten, wenn Sie die Daten ersetzen wollen.

### Plugins mit Daten

Jedes Plugin, dessen Tabellen Zeilen enthalten, braucht seinen 2.0-Build im Plugin-Ordner, bevor 2.0 zum ersten Mal startet. Installieren Sie ihn auf demselben Weg wie den 1.x-Build: Davon hängen sein Name und damit die Namen seiner Tabellen ab. Ein Plugin aus dem Marktplatz heißt wie sein npm-Paket (etwa `@attraccess/plugin-wago`), ein hochgeladenes Plugin wie der `name` in seiner `plugin.json` (etwa `wago`). Die Befehle unten nutzen Docker Compose; `docker volume ls` zeigt den Namen Ihres Storage-Volumes (etwa `attraccess_attraccess-storage`).

**Hochgeladene Plugins (ZIP-Datei).** Entpacken Sie die 2.0-ZIP-Datei in das Storage-Volume. Verschieben Sie vorher den 1.x-Build aus dem Plugin-Ordner. Jedes Plugin ist ein Ordner in `plugins/` mit seiner `plugin.json` auf oberster Ebene:

```bash
docker compose stop attraccess
docker run --rm -v <Storage-Volume>:/data -v "$PWD":/zip:ro alpine sh -c '
  ls /data/plugins
  mv /data/plugins/<1.x-Ordner> /data/<1.x-Ordner>-1x
  mkdir /data/plugins/<Name> && unzip /zip/<Plugin>.zip -d /data/plugins/<Name>
  ls /data/plugins/<Name>/plugin.json'
```

**Plugins aus dem Marktplatz.** Eine Installation aus dem Marktplatz braucht ein laufendes 2.0. Starten Sie 2.0 einmal ohne die SQLite-Datei, installieren Sie die Plugins und führen Sie die Übernahme dann auf einer leeren Datenbank aus:

1. Stoppen Sie Attraccess 1.11 und legen Sie die SQLite-Datei beiseite:

   ```bash
   docker compose stop attraccess
   docker run --rm -v <Storage-Volume>:/data alpine sh -c 'cd /data &&
     for f in attraccess.sqlite attraccess.sqlite-wal attraccess.sqlite-shm; do
       if [ -e "$f" ]; then mv "$f" "$f.hold"; fi
     done'
   ```

2. Starten Sie 2.0 mit der leeren PostgreSQL-Datenbank. Es startet als neue Installation: Legen Sie im Einrichtungsassistenten einen vorübergehenden Administrator an.
3. Unter **Einstellungen → Plugins** stehen die 1.x-Plugins mit einem Fehler. Entfernen Sie jedes davon und installieren Sie dann seinen 2.0-Build aus dem Marktplatz.
4. Stoppen Sie Attraccess (`postgres` läuft weiter), leeren Sie die Datenbank und legen Sie die SQLite-Datei zurück:

   ```bash
   docker compose stop attraccess
   docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" attraccess && createdb -U "$POSTGRES_USER" attraccess'
   docker run --rm -v <Storage-Volume>:/data alpine sh -c 'cd /data &&
     for f in attraccess.sqlite attraccess.sqlite-wal attraccess.sqlite-shm; do
       if [ -e "$f.hold" ]; then mv "$f.hold" "$f"; fi
     done'
   ```

5. Starten Sie Attraccess. Die Übernahme läuft mit den 2.0-Builds. Der vorübergehende Administrator ist weg; Ihre 1.x-Konten sind wieder da.

### Übernahme manuell ausführen

Stoppen Sie zuerst die API (`docker compose stop attraccess`) und führen Sie den Befehl dann in einem einmaligen Container aus:

```bash
docker compose run --rm attraccess node dist/apps/api/main.js transfer-sqlite [--sqlite <Pfad>] [--force] [--keep]
```

| Option            | Bedeutung                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--sqlite <Pfad>` | Die SQLite-Datei; Standard `<STORAGE_ROOT>/attraccess.sqlite`                                                           |
| `--force`         | Ersetzt Daten, die schon in der PostgreSQL-Datenbank liegen. Ohne sie wird ein nicht leeres Ziel abgelehnt. Siehe unten |
| `--keep`          | Benennt die SQLite-Datei nach erfolgreicher Übernahme nicht um                                                          |

`--force` leert vor dem Import **jede** Attraccess-Tabelle der Zieldatenbank, auch das Audit-Log und die Tabellen der Plugins; der Befehl listet die Tabellen auf, die er leert. **Stoppen Sie vorher jede API-Instanz.** Der Befehl verweigert die Ausführung nur, solange gerade eine API-Verbindung offen ist; eine untätige API hat womöglich keine offen, deshalb beweist diese Prüfung nicht, dass die API gestoppt ist. Erstellen Sie vorher ein PostgreSQL-Backup, wenn die Daten darin wichtig sind.

In einem Entwicklungs-Checkout lautet das Gegenstück `pnpm nx run api:transfer-sqlite -- --sqlite <Pfad>`.

## Upgrade auf Attraccess 2.0

Attraccess 2.0 übernimmt die Daten von Plugins (WAGO, Matter, Shelly, Reservierungen und andere) nur vom letzten
1.x-Release, **Attraccess 1.11**. Aktualisieren Sie in zwei Schritten:

1. Erstellen Sie ein [Backup](installation/backup-restore.md).
2. Aktualisieren Sie auf Attraccess 1.11 (fixieren Sie das neueste `v1.11.x`-Tag, siehe
   [Eine feste Version festlegen](#eine-feste-version-festlegen)) und starten Sie es **einmal**, damit jedes Plugin seine
   Migrationen abschließt. Prüfen Sie unter **Einstellungen → Plugins**, dass alle Plugins laden.
3. Erstellen Sie ein weiteres Backup, legen Sie die 2.0-Builds Ihrer Plugins bereit (siehe
   [Plugins mit Daten](#plugins-mit-daten)) und aktualisieren Sie dann auf 2.0.

Überspringen Sie Schritt 2, etwa von 1.10 aus, lehnt die Übernahme die Daten jedes betroffenen Plugins mit einer
(englischen) Meldung ab, etwa: "Attraccess 2.0 adopts the data of plugin "wago" only from the last 1.x release (1.11)".
Die API startet nicht. Die SQLite-Datei bleibt unberührt: Wechseln Sie zurück zum 1.11-Image, starten Sie es einmal und
aktualisieren Sie dann erneut auf 2.0.

Für 1.x gebaute Plugins laden unter 2.0 gar nicht (siehe
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
