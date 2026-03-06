# Architektur

Attraccess ist als NX-Monorepo aufgebaut und enthält mehrere Anwendungen sowie gemeinsam genutzte Bibliotheken. Diese Seite gibt einen Überblick über die Projektorganisation.

## Monorepo-Struktur

```
Attraccess/
├── apps/
│   ├── api/                  # NestJS-Backend
│   ├── frontend/             # React-Frontend
│   └── attractap-firmware/   # Attractap NFC-Leser Firmware
├── libs/
│   ├── api-client/           # Generierter OpenAPI-Client
│   ├── react-query-client/   # Generierte TanStack-Query-Hooks
│   ├── database-entities/    # TypeORM-Entity-Definitionen
│   ├── shared/               # Gemeinsame Typen und Hilfsfunktionen
│   ├── plugins-backend-sdk/  # Plugin-SDK für Backend-Erweiterungen
│   ├── plugins-frontend-sdk/ # Plugin-SDK für Frontend-Erweiterungen
│   ├── plugins-frontend-ui/  # Gemeinsame UI-Komponenten für Plugins
│   └── env/                  # Umgebungskonfiguration
└── storage/                  # SQLite-Datenbankdateien (Laufzeit)
```

## Anwendungen

### Backend (`apps/api`)

Das Backend ist eine NestJS-Anwendung, die die REST-API bereitstellt. Es ist in Feature-Module organisiert:

| Modul | Beschreibung |
|-------|-------------|
| **resources** | Ressourcenverwaltung (Maschinen, Türen) |
| **users-and-auth** | Benutzerkonten, Authentifizierung, SSO |
| **settings** | Systemkonfiguration |
| **attractap** | NFC-Leser-Kommunikation |
| **billing** | Nutzungsbasierte Abrechnung |
| **mqtt** | MQTT-Broker-Integration |
| **projects** | Projektverwaltung |
| **plugins** | Plugin-Verwaltung und -Laden |

### Frontend (`apps/frontend`)

Das Frontend ist eine React-Anwendung, die folgende Technologien nutzt:

- **HeroUI** – Komponentenbibliothek für die Benutzeroberfläche
- **TanStack Query** – Datenabruf und Caching
- **React Router** – Client-seitiges Routing
- **Vite** – Build-Tool und Entwicklungsserver

Der Vite-Entwicklungsserver leitet alle `/api`-Anfragen an das Backend weiter, sodass das Frontend immer über denselben Ursprung kommuniziert.

### Attractap Firmware (`apps/attractap-firmware`)

Firmware für die ESP32-basierte Attractap NFC-Kartenleser-Hardware. Dies ist ein eigenständiges Embedded-Projekt.

## Bibliotheken

### Generierte Bibliotheken

Diese Bibliotheken werden automatisch aus der OpenAPI-Spezifikation des Backends generiert und sollten nicht manuell bearbeitet werden:

| Bibliothek | Beschreibung |
|-----------|-------------|
| **api-client** | TypeScript-HTTP-Client, generiert aus der Swagger/OpenAPI-Spezifikation (`Api.ts`) |
| **react-query-client** | TanStack-Query-Hooks, generiert aus der API-Spezifikation (`schemas.gen.ts`, `types.gen.ts`) |

Nach Änderungen an der API müssen diese Bibliotheken neu generiert werden, um sie synchron zu halten.

### Gemeinsame Bibliotheken

| Bibliothek | Beschreibung |
|-----------|-------------|
| **database-entities** | TypeORM-Entity-Definitionen, die zwischen Backend-Modulen geteilt werden |
| **shared** | Typen, Interfaces und Hilfsfunktionen, die anwendungsübergreifend genutzt werden |
| **env** | Umgebungsvariablen-Verwaltung und Konfiguration |

### Plugin-SDKs

| Bibliothek | Beschreibung |
|-----------|-------------|
| **plugins-backend-sdk** | SDK zur Entwicklung von Backend-Plugin-Erweiterungen |
| **plugins-frontend-sdk** | SDK zur Entwicklung von Frontend-Plugin-Erweiterungen |
| **plugins-frontend-ui** | Wiederverwendbare UI-Komponenten für Plugin-Frontends |

## Datenbank

Attraccess verwendet **SQLite** als Datenbank, verwaltet über **TypeORM**. Wichtige Eigenschaften:

- Kein separater Datenbankserver erforderlich
- Datenbankdatei wird im Verzeichnis `storage/` gespeichert
- Migrationen werden beim Anwendungsstart automatisch ausgeführt
- Entity-Definitionen befinden sich in der Bibliothek `database-entities`

## Authentifizierung

Die Authentifizierung erfolgt über **Session-Cookies**. Das System unterstützt:

- Anmeldung mit Benutzername/Passwort
- SSO über OpenID Connect (OIDC)
- SSO über SAML
- Zwei-Faktor-Authentifizierung (TOTP)

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte
- [API-Referenz](developer/api-reference.md) – REST-API-Details
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
