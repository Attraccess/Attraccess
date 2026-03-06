# Installation mit Portainer

Portainer ist eine grafische Verwaltungsoberfläche für Docker. Wenn Sie Portainer bereits nutzen, können Sie Attraccess bequem darüber installieren.

## Voraussetzungen

- Portainer ist installiert und erreichbar
- Docker läuft auf Ihrem Server

## 1. Stack erstellen

1. Öffnen Sie Portainer in Ihrem Browser
2. Navigieren Sie zu **Stacks** → **Add stack**
3. Geben Sie dem Stack einen Namen, z.B. `attraccess`
4. Fügen Sie folgende Konfiguration im **Web editor** ein:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    ports:
      - "3000:3000"
    volumes:
      - attraccess-storage:/app/storage
    environment:
      - AUTH_SESSION_SECRET=ihr-zufaelliger-sicherer-schluessel
      - ATTRACCESS_URL=https://attraccess.ihre-domain.de
      - LICENSE_KEY=ihr-lizenzschluessel
    restart: unless-stopped

volumes:
  attraccess-storage:
```

## 2. Umgebungsvariablen eintragen

Alternativ zu den Inline-Variablen können Sie im Bereich **Environment variables** die Werte einzeln eingeben. Nötige Variablen:

| Variable | Wert |
|----------|------|
| `AUTH_SESSION_SECRET` | Ein zufälliger, sicherer Schlüssel |
| `ATTRACCESS_URL` | Die URL Ihrer Installation |
| `LICENSE_KEY` | Ihr Lizenzschlüssel |

Weitere Variablen finden Sie unter [Umgebungsvariablen](installation/environment-variables.md).

## 3. Stack deployen

Klicken Sie auf **Deploy the stack**. Portainer lädt das Docker-Image und startet den Container.

## 4. Ersteinrichtung

Öffnen Sie `http://ihr-server:3000` im Browser und folgen Sie dem [Einrichtungsassistenten](setup/first-time-setup.md).

## Stack aktualisieren

Um Attraccess zu aktualisieren:

1. Navigieren Sie zu **Stacks** → `attraccess`
2. Klicken Sie auf **Pull and redeploy**
3. Bestätigen Sie die Aktion

Details zur Aktualisierung finden Sie unter [Aktualisierung](installation/updating.md).

## Siehe auch

- [Docker Compose Installation](installation/docker-compose.md)
- [Umgebungsvariablen](installation/environment-variables.md)
- [Ersteinrichtung](setup/first-time-setup.md)
