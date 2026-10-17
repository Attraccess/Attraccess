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
| **Attractap** | `/api/attractap` | RFID-Leser-Verwaltung |
| **MQTT** | `/api/mqtt` | MQTT-Server-Konfiguration |
| **Billing** | `/api/billing` | Abrechnung und Transaktionen |
| **Plugins** | `/api/plugins` | Plugin-Verwaltung |

## Attractap-WebSocket: Sitzung beenden

Der authentifizierte Leser sendet ein `EVENT` mit `data.type: "STOP_RESOURCE_USAGE_SESSION"` und `data.payload: { resourceId: number, requestId?: number }`. Die Antwort nutzt denselben Ereignistyp und übernimmt die optionale Anfrage-ID. Pflichtformulare verschieben das Beenden und die Erfolgsantwort bis zum Absenden. Fehler liefern `error: string` statt einer Erfolgsantwort.

Bei Erfolg enthält die Antwort `success: true` und `endedOwnSession: boolean`: Der Eigentümer der beendeten Nutzung wird mit dem authentifizierten Akteur verglichen. `durationSeconds?: number` ist die vergangene Sitzungszeit aus den gespeicherten Start-/Endzeitpunkten, auf ganze Sekunden abgerundet und mindestens null. Ungültige oder fehlende Zeitpunkte lassen das Feld entfallen. Dies ist weder Betriebszeit noch abgerechnete Zeit.

`billingSummary?: { amount: number, total: string }` erscheint nur für eine eigene Gebühr ungleich null. `amount` nutzt die Datenbank-Währungseinheiten; `total` ist der bestehende formatierte Währungs-/Credits-Text und wird unverändert angezeigt. Ein Fehler beim Laden der Gebühr macht das erfolgreiche Beenden nicht zum Fehler und entfernt Dauer/Eigentümer nicht. Neue Firmware akzeptiert ganze Dauern von 0–4294967295 und nutzt die bisherige Rückmeldung bei fehlenden oder ungültigen Zusammenfassungsdaten. Ältere Firmware ignoriert die zusätzlichen Felder.

```json
{"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"success":true,"requestId":42,"endedOwnSession":true,"durationSeconds":1440,"billingSummary":{"amount":290,"total":"2,90 EUR"}}}}
```

Antwort ohne Gebühr (einschließlich Nullbeträgen):

```json
{"event":"EVENT","data":{"type":"STOP_RESOURCE_USAGE_SESSION","payload":{"success":true,"requestId":43,"endedOwnSession":true,"durationSeconds":1440}}}
```

## Clients neu generieren

Nach Änderungen an API-Endpunkten müssen die Client-Bibliotheken neu generiert werden, um sie mit dem Backend synchron zu halten. Die genauen Regenerierungsbefehle finden Sie in den Build-Skripten des Projekts.

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte
- [Architektur](developer/architecture.md) – Projektstruktur
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
