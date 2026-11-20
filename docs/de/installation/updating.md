# Aktualisierung

<!-- llms-description: So prüfen Sie auf neue Attraccess-Versionen und aktualisieren mit Docker Compose, Docker oder Portainer, legen eine feste Version fest und gehen über 1.11 auf 2.0. -->

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
Schritte nötig. Das Upgrade von 1.x auf 2.0 braucht einen zusätzlichen Schritt, siehe
[Upgrade auf Attraccess 2.0](#upgrade-auf-attraccess-20).

## Klassisches Docker

```bash
# Laufenden Container stoppen und entfernen (Volumes bleiben erhalten)
docker stop attraccess && docker rm attraccess

# Neuestes Image von Docker Hub oder GHCR laden
docker pull attraccess/attraccess:latest
# oder:
docker pull ghcr.io/attraccess/attraccess:latest

# Container mit den gleichen Volumes/Umgebungsvariablen neu erstellen
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
