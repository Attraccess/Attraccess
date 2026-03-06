# Quick Start

This guide gets Attraccess running in just a few minutes.

## Prerequisites

- Docker and Docker Compose are installed ([guide](https://docs.docker.com/get-docker/))
- A free port (default: 3000)

## 1. Create Project Directory

```bash
mkdir attraccess && cd attraccess
```

## 2. Create Docker Compose File

Create a file called `docker-compose.yml`:

```yaml
services:
  attraccess:
    image: ghcr.io/attraccess/attraccess:latest
    ports:
      - "3000:3000"
    volumes:
      - attraccess-storage:/app/storage
    environment:
      - AUTH_SESSION_SECRET=please-change-this-value
      - ATTRACCESS_URL=http://localhost:3000
    restart: unless-stopped

volumes:
  attraccess-storage:
```

> [!WARNING]
> Make sure to change `AUTH_SESSION_SECRET` to a random, secure value. This key encrypts session data.

## 3. Start

```bash
docker compose up -d
```

## 4. First-Time Setup

Open your browser and navigate to:

```
http://localhost:3000
```

Since no user account exists yet, you will be automatically redirected to the **Setup Wizard**. There you will configure:

1. **Application Settings** – URL and license key
2. **Email Settings** – SMTP server for email delivery
3. **Administrator Account** – Your first user account
4. **Email Verification** – Check your inbox

Details can be found at [First-Time Setup](setup/first-time-setup.md).

## Next Steps

- [First-Time Setup](setup/first-time-setup.md) – Detailed guide for the setup wizard
- [Docker Compose Installation](installation/docker-compose.md) – Production-ready installation
- [SSL Setup](installation/ssl-setup.md) – Enable HTTPS
