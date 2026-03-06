# SSL Setup

HTTPS is strongly recommended for running Attraccess in production, especially if you want to use SSO (Single Sign-On).

## Option 1: Reverse Proxy (Recommended)

The easiest method is a reverse proxy that automatically obtains SSL certificates via Let's Encrypt.

### Nginx Proxy Manager

Nginx Proxy Manager provides a graphical interface for managing proxy hosts and SSL certificates.

Add the service to your `docker-compose.yml`:

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

**Configuration:**

1. Open `http://your-server:81` in your browser
2. Log in (default: `admin@example.com` / `changeme`)
3. Create a **Proxy Host**:
   - **Domain:** Your domain (e.g. `attraccess.your-domain.com`)
   - **Forward Hostname:** `attraccess`
   - **Forward Port:** `3000`
   - **Websockets Support:** Enable
4. In the **SSL** tab:
   - Request a Let's Encrypt certificate
   - Enable **Force SSL**

### Traefik

If you prefer Traefik, add labels to the Attraccess container:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.attraccess.rule=Host(`attraccess.your-domain.com`)"
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

## Option 2: Self-Signed Certificates

Attraccess can automatically generate self-signed certificates. This is only suitable for test environments.

Set in your `.env`:

```bash
SSL_GENERATE_SELF_SIGNED_CERTIFICATES=true
```

Certificates are generated automatically at startup and stored in the storage directory.

> [!WARNING]
> Browsers will show a warning for self-signed certificates. Do not use this option in production environments.

## Option 3: Custom Certificates

If you have your own SSL certificates, you can use them directly:

```bash
SSL_KEY_FILE=/app/storage/ssl/privkey.pem
SSL_CERT_FILE=/app/storage/ssl/fullchain.pem
```

Mount the certificate files into the container:

```yaml
services:
  attraccess:
    volumes:
      - attraccess-storage:/app/storage
      - ./ssl/privkey.pem:/app/storage/ssl/privkey.pem:ro
      - ./ssl/fullchain.pem:/app/storage/ssl/fullchain.pem:ro
```

## Important for SSO

If you use [OIDC](user-management/sso-oidc.md) or [SAML](user-management/sso-saml.md), your Attraccess URL **must** use HTTPS. SSO providers redirect users back to your URL after login – without HTTPS, session cookies will not work correctly.

## See Also

- [Docker Compose Installation](installation/docker-compose.md)
- [Environment Variables](installation/environment-variables.md)
- [Security](settings/security.md)
