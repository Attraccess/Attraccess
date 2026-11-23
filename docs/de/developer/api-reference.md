# API-Referenz
<!-- llms-description: Beschreibt die REST-API mit OpenAPI-Dokumentation, generiertem API-Client und React-Query-Hooks, Authentifizierung und wichtigen Modulen. -->

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

## Sitzungsdauer und Verlängerung

Maschinen können eine **maximale Sitzungsdauer** haben und eine **Zeitschätzung verlangen** (Ressourcenfelder `maxSessionDurationMinutes`, `requireSessionDurationEstimate` und `defaultSessionDurationEstimateMinutes`; nur Maschinen, Türen ignorieren sie). Eine Sitzung speichert ihr Ende beim Start: `autoEndAt` (wann der Server sie beendet), `maxAutoEndAt` (das späteste Ende, auf das verlängert werden kann; `null` ohne maximale Sitzungsdauer, dann gilt die Grenze von 30 Tagen) und `estimatedDurationMinutes`. Spätere Änderungen der Ressourceneinstellungen ändern laufende Sitzungen nicht.

**Starten.** `POST /api/resources/{resourceId}/usage/start` akzeptiert das optionale `estimatedDurationMinutes` (1–43200). Bei Ressourcen ohne verlangte Schätzung wird es ignoriert. Fehler sind `400` mit einem maschinenlesbaren `code`:

| Code | Bedeutung |
|------|-----------|
| `SESSION_DURATION_ESTIMATE_REQUIRED` | Die Ressource verlangt eine Schätzung und die Anfrage hat keine. Der Body nennt `maxSessionDurationMinutes` (oder `null`). |
| `SESSION_DURATION_ESTIMATE_EXCEEDS_MAXIMUM` | Die Schätzung liegt über der maximalen Sitzungsdauer. |

> [!WARNING]
> API-Token- und MCP-Clients, die Sitzungen starten, scheitern mit `SESSION_DURATION_ESTIMATE_REQUIRED` bei jeder Ressource, bei der ein Admin **Zeitschätzung verlangen** einschaltet. Senden Sie dort `estimatedDurationMinutes`.

**Verlängern.** `POST /api/resources/{resourceId}/usage/extend` mit `{ "usageId"?: number, "extendByMinutes"?: 60 | 120 | 240 | 360 | 720 | 1440, "toMax"?: boolean }` verschiebt `autoEndAt` nach hinten. Ohne `usageId` wird die eigene Sitzung verlängert. Der Sitzungsinhaber und alle, die die Sitzung beenden dürfen, können sie verlängern. `toMax: true` setzt exakt Start plus maximale Sitzungsdauer. Die Antwort ist die Sitzung mit neuem `autoEndAt`; die Änderung wird im Audit-Log festgehalten (`usage_session.extended`) und an die Web-App und die Leser gesendet. Fehler sind `400` mit einem `code`; es wird nichts gekürzt:

| Code | Bedeutung |
|------|-----------|
| `SESSION_EXTENSION_EXCEEDS_MAXIMUM` | Das neue Ende läge nach `maxAutoEndAt` (oder der Grenze von 30 Tagen). Der Body enthält `maxAutoEndAt`. |
| `SESSION_EXTENSION_NOT_POSSIBLE` | Die Sitzung hat kein automatisches Ende, es ist schon erreicht, die Sitzung wird gerade beendet, oder `toMax` bei einer Maschine ohne maximale Sitzungsdauer. |
| `SESSION_EXTENSION_INVALID` | Weder ein erlaubtes `extendByMinutes` noch `toMax` wurde gesendet. |

**Automatisches Ende.** Ein Job beendet Sitzungen, die `autoEndAt` erreicht haben, als System, normalerweise innerhalb einer Minute: Abschlussformulare werden übersprungen, Stopp-Flows laufen, die Abrechnung bleibt unverändert, und die Endnotiz lautet „Automatically ended: maximum session time reached“ oder „Automatically ended: estimated duration elapsed“. Der Audit-Eintrag enthält den Endgrund (`auto_maximum` oder `auto_estimate`).

## Attractap-WebSocket: Sitzungsdauer

Ein Leser meldet in `READER_FIRMWARE_INFO` `capabilities.sessionDuration: true`, wenn er eine Zeiteingabe und Verlängern-Schaltflächen hat. Die Ressourcenliste enthält dann pro Maschine `requireSessionDurationEstimate` und `maxSessionDurationMinutes`. Jede aufgeführte Sitzung kann `autoEndAt` (ISO), `autoEndUtcOffsetMinutes`, `autoEndInSeconds`, `hasMaxSessionTime` und `extendLimitInSeconds` (Sekunden bis zum spätestmöglichen Ende) enthalten, gerechnet ab dem Zeitpunkt, zu dem die Liste erstellt wurde.

`START_RESOURCE_USAGE_SESSION` akzeptiert das optionale `estimatedDurationMinutes`; der Server prüft es wie bei einem Web-Start. Ein Start von einem Leser ohne diese Fähigkeit wird nie wegen einer fehlenden Schätzung abgelehnt: Das Ende ist die maximale Sitzungsdauer, ohne Maximum die Standardschätzung (60 Minuten, wenn nicht gesetzt).

`EXTEND_RESOURCE_USAGE_SESSION` mit `payload: { resourceId, usageId?, extendByMinutes?, toMax?, requestId? }` verlängert die Sitzung des Karteninhabers nach denselben Identitätsregeln wie ein Stopp. Die Antwort ist `{ success: true, usageId }` oder `{ error }` mit den oben genannten Codes. Der Leser erhält eine neue Ressourcenliste, auch wenn die Sitzung anderswo verlängert wurde.

## Clients neu generieren

Nach Änderungen an API-Endpunkten müssen die Client-Bibliotheken neu generiert werden, um sie mit dem Backend synchron zu halten. Die genauen Regenerierungsbefehle finden Sie in den Build-Skripten des Projekts.

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte
- [Architektur](developer/architecture.md) – Projektstruktur
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
