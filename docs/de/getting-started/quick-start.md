# Schnellstart

Diese Anleitung bringt Attraccess in wenigen Minuten zum Laufen.

## Voraussetzungen

- Docker und Docker Compose sind installiert ([Anleitung](https://docs.docker.com/get-docker/))
- Ein freier Port (Standard: 3000)

## 1. Projektverzeichnis erstellen

```bash
mkdir attraccess && cd attraccess
```

## 2. Docker-Compose-Datei erstellen

Erstellen Sie eine Datei `docker-compose.yml`:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    ports:
      - "3000:3000"
    volumes:
      - attraccess-storage:/app/storage
    environment:
      - AUTH_SESSION_SECRET=bitte-aendern-sie-diesen-wert
      - ATTRACCESS_URL=http://localhost:3000
    restart: unless-stopped

volumes:
  attraccess-storage:
```

> [!WARNING]
> Ändern Sie `AUTH_SESSION_SECRET` unbedingt in einen zufälligen, sicheren Wert. Dieser Schlüssel verschlüsselt Sitzungsdaten.

## 3. Starten

```bash
docker compose up -d
```

## 4. Ersteinrichtung

Öffnen Sie Ihren Browser und navigieren Sie zu:

```
http://localhost:3000
```

Da noch kein Benutzerkonto existiert, werden Sie automatisch zum **Einrichtungsassistenten** weitergeleitet. Dort konfigurieren Sie:

1. **Anwendungseinstellungen** – URL und Lizenzschlüssel
2. **E-Mail-Einstellungen** – SMTP-Server für E-Mail-Versand
3. **Administrator-Konto** – Ihr erstes Benutzerkonto
4. **E-Mail-Bestätigung** – Überprüfen Sie Ihr Postfach

Details finden Sie unter [Ersteinrichtung](setup/first-time-setup.md).

## Nächste Schritte

- [Ersteinrichtung](setup/first-time-setup.md) – Detaillierte Anleitung zum Einrichtungsassistenten
- [Docker Compose Installation](installation/docker-compose.md) – Produktionsreife Installation
- [SSL einrichten](installation/ssl-setup.md) – HTTPS aktivieren
