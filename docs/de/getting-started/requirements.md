# Systemanforderungen

## Server-Anforderungen

Attraccess wird als Docker-Container bereitgestellt. Sie benötigen einen Server mit:

| Anforderung | Minimum | Empfohlen |
|-------------|---------|-----------|
| **Betriebssystem** | Linux, macOS oder Windows mit Docker | Linux (Debian/Ubuntu) |
| **CPU** | 1 Kern | 2 Kerne |
| **RAM** | 512 MB | 1 GB |
| **Speicherplatz** | 1 GB | 5 GB (je nach Nutzung) |
| **Docker** | Docker 20.10+ | Aktuelle Version |
| **Docker Compose** | v2.0+ | Aktuelle Version |

> [!NOTE]
> Attraccess verwendet SQLite als Datenbank. Sie benötigen keinen separaten Datenbankserver.

## Netzwerk-Anforderungen

| Anforderung | Details |
|-------------|---------|
| **Port** | 3000 (Standard, anpassbar) |
| **HTTPS** | Empfohlen für Produktion (via Reverse Proxy) |
| **Domain** | Empfohlen für SSO und öffentlichen Zugang |

## Client-Anforderungen

Attraccess läuft in jedem modernen Webbrowser:

- Google Chrome (ab Version 90)
- Mozilla Firefox (ab Version 90)
- Microsoft Edge (ab Version 90)
- Safari (ab Version 14)

Die Anwendung ist als Progressive Web App (PWA) konzipiert und funktioniert auch auf Mobilgeräten.

## Optionale Komponenten

| Komponente | Wofür |
|------------|-------|
| **SMTP-Server** | E-Mail-Versand (Registrierung, Benachrichtigungen) |
| **Reverse Proxy** | SSL-Terminierung, z.B. Nginx Proxy Manager oder Traefik |
| **MQTT-Broker** | IoT-Integration (z.B. RabbitMQ, Mosquitto) |
| **Attractap NFC-Leser** | Physische NFC-Zugangskontrolle |

## Nächste Schritte

- [Schnellstart](getting-started/quick-start.md) – Attraccess sofort starten
- [Docker Compose Installation](installation/docker-compose.md) – Detaillierte Installationsanleitung
