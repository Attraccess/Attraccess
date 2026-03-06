# Installation mit Docker Compose

Diese Anleitung beschreibt die empfohlene Installation von Attraccess für den produktiven Betrieb.

## Voraussetzungen

- Docker und Docker Compose v2 ([Installationsanleitung](https://docs.docker.com/get-docker/))
- Ein Server mit mindestens 512 MB RAM und 1 GB Speicherplatz
- (Optional) Eine Domain mit DNS-Eintrag, der auf Ihren Server zeigt

## 1. Projektverzeichnis einrichten

```bash
mkdir attraccess && cd attraccess
```

## 2. Umgebungsvariablen erstellen

Erstellen Sie eine Datei `.env`:

```bash
# Pflichteinstellungen
AUTH_SESSION_SECRET=ihr-zufaelliger-sicherer-schluessel
ATTRACCESS_URL=https://attraccess.ihre-domain.de

# E-Mail (SMTP)
SMTP_SERVICE=SMTP
SMTP_HOST=smtp.ihre-domain.de
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=no-reply@ihre-domain.de
SMTP_PASS=ihr-smtp-passwort
SMTP_FROM=no-reply@ihre-domain.de

# Lizenz
LICENSE_KEY=ihr-lizenzschluessel

# Optional
LOG_LEVELS=error,warn,log
TZ=Europe/Berlin
```

> [!TIP]
> Erzeugen Sie einen sicheren `AUTH_SESSION_SECRET` mit:
> ```bash
> openssl rand -base64 32
> ```

Alle verfügbaren Variablen finden Sie unter [Umgebungsvariablen](installation/environment-variables.md).

## 3. Docker-Compose-Datei erstellen

Erstellen Sie eine Datei `docker-compose.yml`:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    ports:
      - "3000:3000"
    volumes:
      - attraccess-storage:/app/storage
    env_file:
      - .env
    restart: unless-stopped

volumes:
  attraccess-storage:
```

## 4. Starten

```bash
docker compose up -d
```

Prüfen Sie den Status:

```bash
docker compose logs -f attraccess
```

Die Anwendung ist verfügbar unter `http://ihr-server:3000`.

## 5. Ersteinrichtung durchführen

Öffnen Sie die Anwendung im Browser und folgen Sie dem [Einrichtungsassistenten](setup/first-time-setup.md).

## Mit Reverse Proxy (empfohlen)

Für HTTPS empfehlen wir einen Reverse Proxy. Hier ein Beispiel mit Nginx Proxy Manager:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    expose:
      - "3000"
    volumes:
      - attraccess-storage:/app/storage
    env_file:
      - .env
    restart: unless-stopped

  proxy:
    image: jc21/nginx-proxy-manager:latest
    ports:
      - "80:80"
      - "443:443"
      - "81:81"
    volumes:
      - proxy-data:/data
      - proxy-letsencrypt:/etc/letsencrypt
    restart: unless-stopped

volumes:
  attraccess-storage:
  proxy-data:
  proxy-letsencrypt:
```

Konfigurieren Sie im Nginx Proxy Manager (Port 81) einen Proxy-Host:
- **Domain:** `attraccess.ihre-domain.de`
- **Forward Hostname:** `attraccess`
- **Forward Port:** `3000`
- **SSL:** Let's Encrypt Zertifikat aktivieren

Details zur SSL-Konfiguration finden Sie unter [SSL einrichten](installation/ssl-setup.md).

## Nächste Schritte

- [Umgebungsvariablen](installation/environment-variables.md) – Alle Konfigurationsoptionen
- [SSL einrichten](installation/ssl-setup.md) – HTTPS aktivieren
- [Ersteinrichtung](setup/first-time-setup.md) – Grundkonfiguration vornehmen
- [Backup & Wiederherstellung](installation/backup-restore.md) – Daten sichern
