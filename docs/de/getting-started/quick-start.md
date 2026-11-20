# Schnellstart

<!-- llms-description: Anleitung, um Attraccess in wenigen Minuten mit Docker Compose zu starten und die Ersteinrichtung abzuschließen. -->

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
      - '3000:3000'
    volumes:
      - attraccess-storage:/app/storage
    environment:
      - AUTH_SESSION_SECRET=bitte-aendern-sie-diesen-wert
      - ATTRACCESS_URL=http://localhost:3000
      - DATABASE_URL=postgres://attraccess:bitte-aendern-sie-dieses-passwort@postgres:5432/attraccess
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:18.6-alpine
    environment:
      - POSTGRES_USER=attraccess
      - POSTGRES_PASSWORD=bitte-aendern-sie-dieses-passwort
      - POSTGRES_DB=attraccess
    volumes:
      - postgres-data:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U attraccess -d attraccess']
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  attraccess-storage:
  postgres-data:
```

Attraccess speichert seine Daten in PostgreSQL, das nicht im Attraccess-Image enthalten ist. Der Dienst `postgres` startet die Datenbank, und `DATABASE_URL` teilt Attraccess mit, wie es sie erreicht: Ohne `DATABASE_URL` startet Attraccess nicht.

> [!WARNING]
> Ändern Sie `AUTH_SESSION_SECRET` unbedingt in einen zufälligen, sicheren Wert. Dieser Schlüssel verschlüsselt Sitzungsdaten.
>
> Ersetzen Sie auch das Datenbankpasswort, in `POSTGRES_PASSWORD` **und** in `DATABASE_URL` (verwenden Sie Buchstaben und Ziffern, z. B. `openssl rand -hex 24`). PostgreSQL legt das Passwort fest, wenn es beim ersten Start das Volume `postgres-data` anlegt; eine spätere Änderung von `POSTGRES_PASSWORD` wirkt nicht mehr.

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
