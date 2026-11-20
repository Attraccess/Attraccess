# SSL einrichten
<!-- llms-description: Wie Attraccess per HTTPS bereitgestellt wird: Reverse Proxy, selbst-signierte oder eigene Zertifikate und Anforderungen für SSO. -->

HTTPS ist für den produktiven Betrieb von Attraccess dringend empfohlen, insbesondere wenn Sie SSO (Single Sign-On) nutzen möchten.

## Option 1: Reverse Proxy (empfohlen)

Die einfachste Methode ist ein Reverse Proxy, der SSL-Zertifikate automatisch über Let's Encrypt bezieht.

### Nginx Proxy Manager

Nginx Proxy Manager bietet eine grafische Oberfläche zur Verwaltung von Proxy-Hosts und SSL-Zertifikaten.

Fügen Sie den Proxy zu Ihrer `docker-compose.yml` hinzu (die Dienste `attraccess` und `postgres` sind die aus der [Docker-Compose-Installation](installation/docker-compose.md)):

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
    environment:
      DATABASE_URL: postgres://attraccess:${POSTGRES_PASSWORD}@postgres:5432/attraccess
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:18.6-alpine
    environment:
      POSTGRES_USER: attraccess
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: attraccess
    volumes:
      - postgres-data:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U attraccess -d attraccess"]
      interval: 10s
      timeout: 5s
      retries: 5
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
  postgres-data:
  proxy-data:
  proxy-letsencrypt:
```

**Konfiguration:**

1. Öffnen Sie `http://ihr-server:81` im Browser
2. Melden Sie sich an (Standard: `admin@example.com` / `changeme`)
3. Erstellen Sie einen **Proxy Host**:
   - **Domain:** Ihre Domain (z.B. `attraccess.ihre-domain.de`)
   - **Forward Hostname:** `attraccess`
   - **Forward Port:** `3000`
   - **Websockets Support:** Aktivieren
4. Im Tab **SSL**:
   - Let's Encrypt Zertifikat anfordern
   - **Force SSL** aktivieren

### Traefik

Falls Sie Traefik bevorzugen, fügen Sie Labels zum Attraccess-Container derselben Compose-Datei hinzu (der Dienst `postgres`, `DATABASE_URL` und `depends_on` bleiben erhalten):

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.attraccess.rule=Host(`attraccess.ihre-domain.de`)"
      - "traefik.http.routers.attraccess.tls.certresolver=letsencrypt"
      - "traefik.http.services.attraccess.loadbalancer.server.port=3000"
    expose:
      - "3000"
    volumes:
      - attraccess-storage:/app/storage
    env_file:
      - .env
    restart: unless-stopped
```

## Option 2: Selbst-signierte Zertifikate

Attraccess kann selbst-signierte Zertifikate automatisch erzeugen. Dies ist nur für Testumgebungen geeignet.

Setzen Sie in Ihrer `.env`:

```bash
SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true
```

Die Zertifikate werden beim Start automatisch erzeugt und im Speicherverzeichnis abgelegt.

> [!WARNING]
> Browser zeigen bei selbst-signierten Zertifikaten eine Warnung an. Verwenden Sie diese Option nicht in Produktionsumgebungen.

## Option 3: Eigene Zertifikate

Wenn Sie eigene SSL-Zertifikate haben, können Sie diese direkt einbinden:

```bash
SSL_KEY_FILE=/app/storage/ssl/privkey.pem
SSL_CERT_FILE=/app/storage/ssl/fullchain.pem
```

Mounten Sie die Zertifikatsdateien in den Container:

```yaml
services:
  attraccess:
    volumes:
      - attraccess-storage:/app/storage
      - ./ssl/privkey.pem:/app/storage/ssl/privkey.pem:ro
      - ./ssl/fullchain.pem:/app/storage/ssl/fullchain.pem:ro
```

## Wichtig für SSO

Wenn Sie [OIDC](user-management/sso-oidc.md) oder [SAML](user-management/sso-saml.md) verwenden, **muss** Ihre Attraccess-URL HTTPS verwenden. SSO-Anbieter leiten Benutzer nach der Anmeldung zurück zu Ihrer URL – ohne HTTPS funktionieren die Sitzungs-Cookies nicht korrekt.

## Siehe auch

- [Docker Compose Installation](installation/docker-compose.md)
- [Umgebungsvariablen](installation/environment-variables.md)
- [Sicherheit](settings/security.md)
