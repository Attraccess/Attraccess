# System Requirements

## Server Requirements

Attraccess is deployed as a Docker container. You need a server with:

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Operating System** | Linux, macOS or Windows with Docker | Linux (Debian/Ubuntu) |
| **CPU** | 1 core | 2 cores |
| **RAM** | 512 MB | 1 GB |
| **Disk Space** | 1 GB | 5 GB (depending on usage) |
| **Docker** | Docker 20.10+ | Latest version |
| **Docker Compose** | v2.0+ | Latest version |

> [!NOTE]
> Attraccess uses SQLite as its database. You do not need a separate database server.

## Network Requirements

| Requirement | Details |
|-------------|---------|
| **Port** | 3000 (default, configurable) |
| **HTTPS** | Recommended for production (via reverse proxy) |
| **Domain** | Recommended for SSO and public access |

## Client Requirements

Attraccess runs in any modern web browser:

- Google Chrome (version 90+)
- Mozilla Firefox (version 90+)
- Microsoft Edge (version 90+)
- Safari (version 14+)

The application is designed as a Progressive Web App (PWA) and also works on mobile devices.

## Optional Components

| Component | Purpose |
|-----------|---------|
| **SMTP Server** | Email delivery (registration, notifications) |
| **Reverse Proxy** | SSL termination, e.g. Nginx Proxy Manager or Traefik |
| **MQTT Broker** | IoT integration (e.g. RabbitMQ, Mosquitto) |
| **Attractap NFC Reader** | Physical NFC access control |

## Next Steps

- [Quick Start](getting-started/quick-start.md) – Get Attraccess running immediately
- [Docker Compose Installation](installation/docker-compose.md) – Detailed installation guide
