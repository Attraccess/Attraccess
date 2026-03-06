# API-Referenz

Attraccess stellt eine REST-API für alle Operationen bereit. Die API ist vollständig mit der OpenAPI-(Swagger-)Spezifikation dokumentiert.

## Interaktive API-Dokumentation

Die Swagger-Oberfläche ist auf jeder laufenden Attraccess-Instanz verfügbar unter:

```
https://ihre-attraccess-instanz/api
```

Im Entwicklungsmodus typischerweise unter:

```
http://localhost:3000/api
```

<!-- TODO: Screenshot der Swagger-Oberfläche -->

Die Swagger-Oberfläche ermöglicht es Ihnen, alle Endpunkte zu durchsuchen, Anfrage-/Antwort-Schemas einzusehen und API-Aufrufe direkt im Browser auszuprobieren.

## Generierter API-Client

Das Projekt enthält einen vorgenerierten TypeScript-API-Client in der Bibliothek `libs/api-client`. Dieser Client wird automatisch aus der OpenAPI-Spezifikation des Backends generiert.

**Speicherort:** `libs/api-client/src/generated/Api.ts`

Der API-Client bietet typsichere Methoden für alle Endpunkte, sodass Sie keine HTTP-Aufrufe manuell schreiben müssen.

## Generierte React-Query-Hooks

Für das React-Frontend werden TanStack-Query-Hooks automatisch in der Bibliothek `libs/react-query-client` generiert.

**Wichtige Dateien:**

| Datei | Beschreibung |
|-------|-------------|
| `schemas.gen.ts` | Generierte Anfrage-/Antwort-Schemas |
| `types.gen.ts` | Generierte TypeScript-Typdefinitionen |

Diese Hooks übernehmen Datenabruf, Caching und Zustandsverwaltung automatisch.

## Authentifizierung

Die API verwendet **Session-Cookies** zur Authentifizierung. Wenn Sie sich über den Endpunkt `/api/auth/login` anmelden, wird ein Session-Cookie gesetzt. Dieses Cookie wird bei allen nachfolgenden Anfragen mitgesendet.

> [!NOTE]
> Im Vite-Entwicklungssetup leitet das Frontend alle `/api`-Anfragen an das Backend weiter, sodass Cookies nahtlos über denselben Ursprung funktionieren.

## Wichtige API-Module

| Modul | Basispfad | Beschreibung |
|-------|-----------|-------------|
| **Auth** | `/api/auth` | Anmeldung, Abmeldung, Registrierung, SSO |
| **Users** | `/api/users` | Benutzerverwaltung |
| **Resources** | `/api/resources` | Ressourcen-CRUD, Nutzungssitzungen |
| **Projects** | `/api/projects` | Projektverwaltung |
| **Settings** | `/api/settings` | Systemkonfiguration |
| **Attractap** | `/api/attractap` | NFC-Leser-Verwaltung |
| **MQTT** | `/api/mqtt` | MQTT-Server-Konfiguration |
| **Billing** | `/api/billing` | Abrechnung und Transaktionen |
| **Plugins** | `/api/plugins` | Plugin-Verwaltung |

## Clients neu generieren

Nach Änderungen an API-Endpunkten müssen die Client-Bibliotheken neu generiert werden, um sie mit dem Backend synchron zu halten. Die genauen Regenerierungsbefehle finden Sie in den Build-Skripten des Projekts.

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte
- [Architektur](developer/architecture.md) – Projektstruktur
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
