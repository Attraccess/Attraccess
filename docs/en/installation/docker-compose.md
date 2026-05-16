# Installation with Docker Compose

This guide describes the recommended installation of Attraccess for production use.

## Prerequisites

- Docker and Docker Compose v2 ([installation guide](https://docs.docker.com/get-docker/))
- A server with at least 512 MB RAM and 1 GB disk space
- (Optional) A domain with a DNS record pointing to your server

## 1. Set Up Project Directory

```bash
mkdir attraccess && cd attraccess
```

## 2. Create Environment Variables

Create a file called `.env`:

```bash
# Required settings
AUTH_SESSION_SECRET=your-random-secure-key
ATTRACCESS_URL=https://attraccess.your-domain.com

# Email (SMTP)
SMTP_SERVICE=SMTP
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=no-reply@your-domain.com
SMTP_PASS=your-smtp-password
SMTP_FROM=no-reply@your-domain.com

# License
LICENSE_KEY=your-license-key

# Optional
LOG_LEVELS=error,warn,log
TZ=Europe/Berlin
```

> [!TIP]
> Generate a secure `AUTH_SESSION_SECRET` with:
> ```bash
> openssl rand -base64 32
> ```

All available variables are documented at [Environment Variables](installation/environment-variables.md).

## 3. Create Docker Compose File

Create a file called `docker-compose.yml`:

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

## 4. Start

```bash
docker compose up -d
```

Check the status:

```bash
docker compose logs -f attraccess
```

The application is available at `http://your-server:3000`.

## 5. Complete First-Time Setup

Open the application in your browser and follow the [Setup Wizard](setup/first-time-setup.md).

## With Reverse Proxy (Recommended)

For HTTPS, we recommend using a reverse proxy. Here is an example with Nginx Proxy Manager:

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

Configure a proxy host in Nginx Proxy Manager (port 81):
- **Domain:** `attraccess.your-domain.com`
- **Forward Hostname:** `attraccess`
- **Forward Port:** `3000`
- **SSL:** Enable Let's Encrypt certificate

Details on SSL configuration can be found at [SSL Setup](installation/ssl-setup.md).

## Brute-Force IP Banning with fail2ban

Attraccess ships an optional `fail2ban` service that watches the auth audit log and bans IPs that exceed the configured failure threshold. It is gated behind the `fail2ban` Compose profile so it does **not** start by default.

> [!IMPORTANT]
> fail2ban inserts iptables rules on the **host** kernel. It is therefore Linux-only. On Docker Desktop for macOS or Windows the container still starts but the bans are no-ops — use rate limiting (built-in, see [Security Settings](settings/security.md)) instead.

### Enable in production

```bash
docker compose --profile fail2ban up -d
```

### Tune via environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `F2B_ATTRACCESS_MAXRETRY` | `5` | Failures from one IP inside `findtime` before banning. |
| `F2B_ATTRACCESS_FINDTIME` | `900` | Sliding window in seconds for counting failures. |
| `F2B_ATTRACCESS_BANTIME` | `900` | Ban duration in seconds. `-1` = permanent. |
| `F2B_IPTABLES_CHAIN` | `DOCKER-USER` | iptables chain the ban rules are written to. |
| `F2B_LOG_LEVEL` | `INFO` | fail2ban server log level. |
| `F2B_DB_PURGE_AGE` | `1d` | How long fail2ban keeps historical events in its SQLite DB. |

Bans are persisted to the `fail2ban-data` volume so they survive container restarts.

### Local dev

The same service is available in development but stays off unless you explicitly opt in with `--profile fail2ban`. Without the flag `docker compose up` ignores it entirely — your IP will not get banned while testing.

### Admin operations

See [Security Settings → fail2ban administration](settings/security.md#fail2ban-administration) for how to list current bans, unban an IP, and re-tune live.

## Next Steps

- [Environment Variables](installation/environment-variables.md) – All configuration options
- [SSL Setup](installation/ssl-setup.md) – Enable HTTPS
- [First-Time Setup](setup/first-time-setup.md) – Complete initial configuration
- [Backup & Restore](installation/backup-restore.md) – Back up your data
