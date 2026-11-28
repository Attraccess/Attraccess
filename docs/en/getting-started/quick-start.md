# Quick Start

<!-- llms-description: Step-by-step guide to get Attraccess running in minutes with Docker Compose and complete the first-time setup. -->

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
      - '3000:3000'
    volumes:
      - attraccess-storage:/app/storage
    environment:
      - AUTH_SESSION_SECRET=please-change-this-value
      - ATTRACCESS_URL=http://localhost:3000
      - DATABASE_URL=postgres://attraccess:please-change-this-password@postgres:5432/attraccess
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:18.6-alpine
    environment:
      - POSTGRES_USER=attraccess
      - POSTGRES_PASSWORD=please-change-this-password
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

Attraccess stores its data in PostgreSQL, which is not part of the Attraccess image. The `postgres` service starts the database, and `DATABASE_URL` tells Attraccess how to reach it: without `DATABASE_URL` Attraccess does not start.

> [!WARNING]
> Make sure to change `AUTH_SESSION_SECRET` to a random, secure value. This key encrypts session data.
>
> Also replace the database password, in `POSTGRES_PASSWORD` **and** in `DATABASE_URL` (use letters and digits, e.g. `openssl rand -hex 24`). PostgreSQL fixes the password when it creates the `postgres-data` volume on the first start; changing `POSTGRES_PASSWORD` later has no effect.

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

1. **Application Settings** – URL, public URL and default system language
2. **Email Settings** – SMTP server for email delivery
3. **License** – Community / non-profit license or your license key
4. **Administrator Account** – Your first user account
5. **You're all set** – Verify your email address

Details can be found at [First-Time Setup](setup/first-time-setup.md).

## Next Steps

- [First-Time Setup](setup/first-time-setup.md) – Detailed guide for the setup wizard
- [Docker Compose Installation](installation/docker-compose.md) – Production-ready installation
- [SSL Setup](installation/ssl-setup.md) – Enable HTTPS
