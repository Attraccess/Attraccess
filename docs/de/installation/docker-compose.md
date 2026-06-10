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

# Optional: Browser-Push-Benachrichtigungen (z. B. für Direktnachrichten).
# Schlüsselpaar einmalig erzeugen mit: npx web-push generate-vapid-keys
#VAPID_PUBLIC_KEY=ihr-vapid-public-key
#VAPID_PRIVATE_KEY=ihr-vapid-private-key
#VAPID_SUBJECT=mailto:admin@ihre-domain.de
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

## Brute-Force-IP-Sperre mit fail2ban

Attraccess liefert einen optionalen `fail2ban`-Dienst, der das Auth-Audit-Log beobachtet und IPs sperrt, die den konfigurierten Fehler-Schwellenwert ueberschreiten. Er ist hinter dem Compose-Profil `fail2ban` versteckt und startet daher **nicht** standardmaessig.

> [!IMPORTANT]
> fail2ban setzt iptables-Regeln im **Host-Kernel**. Dies ist daher Linux-only. Auf Docker Desktop fuer macOS oder Windows startet der Container zwar, die Sperren sind aber wirkungslos — nutzen Sie statt dessen das eingebaute Rate Limiting (siehe [Sicherheitseinstellungen](settings/security.md)).

### Im Produktivbetrieb aktivieren

```bash
docker compose --profile fail2ban up -d
```

### Per Umgebungsvariablen tunen

| Variable | Standard | Beschreibung |
|----------|----------|-------------|
| `F2B_ATTRACCESS_MAXRETRY` | `5` | Fehlversuche pro IP innerhalb von `findtime`, bevor gesperrt wird. |
| `F2B_ATTRACCESS_FINDTIME` | `900` | Zeitfenster in Sekunden fuer das Zaehlen der Fehlversuche. |
| `F2B_ATTRACCESS_BANTIME` | `900` | Sperrdauer in Sekunden. `-1` = permanent. |
| `F2B_IPTABLES_CHAIN` | `DOCKER-USER` | iptables-Chain, in die die Sperr-Regeln geschrieben werden. |
| `F2B_LOG_LEVEL` | `INFO` | Log-Level des fail2ban-Servers. |
| `F2B_DB_PURGE_AGE` | `1d` | Aufbewahrungszeit historischer Events in der fail2ban-SQLite-DB. |

Sperren werden im Volume `fail2ban-data` persistiert und ueberleben Container-Neustarts.

### Lokale Entwicklung

Derselbe Dienst ist in der Entwicklungsumgebung verfuegbar, bleibt aber inaktiv, solange Sie nicht explizit `--profile fail2ban` setzen. Ohne Flag ignoriert `docker compose up` den Dienst vollstaendig — Ihre IP wird beim Testen nicht gesperrt.

### Admin-Operationen

Siehe [Sicherheitseinstellungen → fail2ban-Administration](settings/security.md#fail2ban-administration) fuer das Auflisten aktiver Sperren, manuelles Entsperren und Live-Tuning.

## Nächste Schritte

- [Umgebungsvariablen](installation/environment-variables.md) – Alle Konfigurationsoptionen
- [SSL einrichten](installation/ssl-setup.md) – HTTPS aktivieren
- [Ersteinrichtung](setup/first-time-setup.md) – Grundkonfiguration vornehmen
- [Backup & Wiederherstellung](installation/backup-restore.md) – Daten sichern
