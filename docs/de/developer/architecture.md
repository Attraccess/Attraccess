# Architektur

Attraccess ist als NX-Monorepo aufgebaut und enthält mehrere Anwendungen sowie gemeinsam genutzte Bibliotheken. Diese Seite gibt einen Überblick über die Projektorganisation.

## Monorepo-Struktur

```
Attraccess/
├── apps/
│   ├── api/                  # NestJS-Backend
│   ├── frontend/             # React-Frontend
│   └── attractap/
│       └── firmware/         # Attractap RFID-Leser Firmware
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

| Modul              | Beschreibung                            |
| ------------------ | --------------------------------------- |
| **resources**      | Ressourcenverwaltung (Maschinen, Türen) |
| **users-and-auth** | Benutzerkonten, Authentifizierung, SSO  |
| **settings**       | Systemkonfiguration                     |
| **attractap**      | RFID-Leser-Kommunikation                |
| **billing**        | Nutzungsbasierte Abrechnung             |
| **mqtt**           | MQTT-Broker-Integration                 |
| **projects**       | Projektverwaltung                       |
| **plugins**        | Plugin-Verwaltung und -Laden            |

### Frontend (`apps/frontend`)

Das Frontend ist eine React-Anwendung, die folgende Technologien nutzt:

- **HeroUI** – Komponentenbibliothek für die Benutzeroberfläche
- **TanStack Query** – Datenabruf und Caching
- **React Router** – Client-seitiges Routing
- **Vite** – Build-Tool und Entwicklungsserver

Der Vite-Entwicklungsserver leitet alle `/api`-Anfragen an das Backend weiter, sodass das Frontend immer über denselben Ursprung kommuniziert.

### Attractap Firmware (`apps/attractap/firmware`)

Firmware für die ESP32-basierte Attractap RFID-Kartenleser-Hardware. Dies ist ein eigenständiges Embedded-Projekt.

## Bibliotheken

### Generierte Bibliotheken

Diese Bibliotheken werden automatisch aus der OpenAPI-Spezifikation des Backends generiert und sollten nicht manuell bearbeitet werden:

| Bibliothek             | Beschreibung                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **api-client**         | TypeScript-HTTP-Client, generiert aus der Swagger/OpenAPI-Spezifikation (`Api.ts`)           |
| **react-query-client** | TanStack-Query-Hooks, generiert aus der API-Spezifikation (`schemas.gen.ts`, `types.gen.ts`) |

Nach Änderungen an der API müssen diese Bibliotheken neu generiert werden, um sie synchron zu halten.

### Gemeinsame Bibliotheken

| Bibliothek            | Beschreibung                                                                     |
| --------------------- | -------------------------------------------------------------------------------- |
| **database-entities** | TypeORM-Entity-Definitionen, die zwischen Backend-Modulen geteilt werden         |
| **shared**            | Typen, Interfaces und Hilfsfunktionen, die anwendungsübergreifend genutzt werden |
| **env**               | Umgebungsvariablen-Verwaltung und Konfiguration                                  |

### Plugin-SDKs

| Bibliothek               | Beschreibung                                          |
| ------------------------ | ----------------------------------------------------- |
| **plugins-backend-sdk**  | SDK zur Entwicklung von Backend-Plugin-Erweiterungen  |
| **plugins-frontend-sdk** | SDK zur Entwicklung von Frontend-Plugin-Erweiterungen |
| **plugins-frontend-ui**  | Wiederverwendbare UI-Komponenten für Plugin-Frontends |

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

## NestJS-API-Konventionen

### Die Controller-Registrierungsreihenfolge ist entscheidend

NestJS (über Express) ordnet Routen nach Registrierungsreihenfolge zu — **zuerst registriert gewinnt**. Ein `:param`-Segment (z. B. `GET /users/:id`) trifft _jedes_ einzelne URL-Segment, einschließlich Strings wie `with-permission`. Dies kann unerwartete Fehler verursachen:

```
// FEHLERHAFT — :id verschluckt jeden folgenden statischen Pfad
controllers: [UsersAdminController,    // hat GET :id
               UserPermissionsController] // hat GET with-permission ← unerreichbar!
```

`GET /users/with-permission` wurde mit dem alten booleschen Berechtigungssystem in ATT-566 entfernt. Rollenzuweisungsabfragen verwenden jetzt `GET /users?roleId=...`; stellen Sie die entfernte Route bei rollenbezogenen Benutzerlistenänderungen nicht wieder her.

**Regeln beim Ergänzen oder Aufteilen eines Controllers:**

1. **Innerhalb einer Controller-Datei** alle statischen Segmentrouten _vor_ jeder `:param`-Route gleicher HTTP-Methode und URL-Tiefe deklarieren.
2. **Im Modul-Array `controllers: []`** Controller mit ausschließlich statischen Routen _vor_ Controllern mit `:param`-Routen unter gleichem `@Controller(prefix)` listen.
3. Teilen mehrere Controller dasselbe Präfix `@Controller('path')` (z. B. alle `@Controller('users')`), überschattet eine `:param`-Route in früherem Controller statische Routen späterer Controller.

Eine automatisierte Prüfung in `apps/api/src/route-shadow.spec.ts` setzt diese Regeln in CI durch — jede neue Überschattung lässt die Tests fehlschlagen.

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte
- [API-Referenz](developer/api-reference.md) – REST-API-Details
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
