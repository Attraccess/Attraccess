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

| Datei            | Beschreibung                          |
| ---------------- | ------------------------------------- |
| `schemas.gen.ts` | Generierte Anfrage-/Antwort-Schemas   |
| `types.gen.ts`   | Generierte TypeScript-Typdefinitionen |

Diese Hooks übernehmen Datenabruf, Caching und Zustandsverwaltung automatisch.

## Authentifizierung

Die API verwendet **Session-Cookies** zur Authentifizierung. Wenn Sie sich über den Endpunkt `/api/auth/login` anmelden, wird ein Session-Cookie gesetzt. Dieses Cookie wird bei allen nachfolgenden Anfragen mitgesendet.

> [!NOTE]
> Im Vite-Entwicklungssetup leitet das Frontend alle `/api`-Anfragen an das Backend weiter, sodass Cookies nahtlos über denselben Ursprung funktionieren.

## Wichtige API-Module

| Modul         | Basispfad        | Beschreibung                             |
| ------------- | ---------------- | ---------------------------------------- |
| **Auth**      | `/api/auth`      | Anmeldung, Abmeldung, Registrierung, SSO |
| **Users**     | `/api/users`     | Benutzerverwaltung                       |
| **Resources** | `/api/resources` | Ressourcen-CRUD, Nutzungssitzungen       |
| **Projects**  | `/api/projects`  | Projektverwaltung                        |
| **Settings**  | `/api/settings`  | Systemkonfiguration                      |
| **Attractap** | `/api/attractap` | RFID-Leser-Verwaltung                    |
| **MQTT**      | `/api/mqtt`      | MQTT-Server-Konfiguration                |
| **Billing**   | `/api/billing`   | Abrechnung und Transaktionen             |
| **Plugins**   | `/api/plugins`   | Plugin-Verwaltung                        |

## Attractap-WebSocket: Sitzung beenden

Der authentifizierte Leser sendet ein `EVENT` mit `data.type: "STOP_RESOURCE_USAGE_SESSION"` und `data.payload: { resourceId: number, requestId?: number }`. Die Antwort nutzt denselben Ereignistyp und übernimmt die optionale Anfrage-ID. Pflichtformulare verschieben das Beenden und die Erfolgsantwort bis zum Absenden. Fehler liefern `error: string` statt einer Erfolgsantwort.

Bei Erfolg enthält die Antwort `success: true` und `endedOwnSession: boolean`: Der Eigentümer der beendeten Nutzung wird mit dem authentifizierten Akteur verglichen. `durationSeconds?: number` ist die vergangene Sitzungszeit aus den gespeicherten Start-/Endzeitpunkten, auf ganze Sekunden abgerundet und mindestens null. Ungültige oder fehlende Zeitpunkte lassen das Feld entfallen. Dies ist weder Betriebszeit noch abgerechnete Zeit.

`billingSummary?: { amount: number, total: string }` erscheint nur für eine eigene Gebühr ungleich null. `amount` nutzt die Datenbank-Währungseinheiten; `total` ist der bestehende formatierte Währungs-/Credits-Text und wird unverändert angezeigt. Ein Fehler beim Laden der Gebühr macht das erfolgreiche Beenden nicht zum Fehler und entfernt Dauer/Eigentümer nicht. Neue Firmware akzeptiert ganze Dauern von 0–4294967295 und nutzt die bisherige Rückmeldung bei fehlenden oder ungültigen Zusammenfassungsdaten. Ältere Firmware ignoriert die zusätzlichen Felder.

```json
{
  "event": "EVENT",
  "data": {
    "type": "STOP_RESOURCE_USAGE_SESSION",
    "payload": {
      "success": true,
      "requestId": 42,
      "endedOwnSession": true,
      "durationSeconds": 1440,
      "billingSummary": { "amount": 290, "total": "2,90 EUR" }
    }
  }
}
```

Antwort ohne Gebühr (einschließlich Nullbeträgen):

```json
{
  "event": "EVENT",
  "data": {
    "type": "STOP_RESOURCE_USAGE_SESSION",
    "payload": { "success": true, "requestId": 43, "endedOwnSession": true, "durationSeconds": 1440 }
  }
}
```

## Sitzungsdauer und Verlängerung

Maschinen können eine **maximale Sitzungsdauer** haben und eine **Dauerschätzung verlangen** (Ressourcenfelder `maxSessionDurationMinutes`, `requireSessionDurationEstimate` und `defaultSessionDurationEstimateMinutes`; nur Maschinen, Türen ignorieren sie). Eine Sitzung speichert ihr Ende beim Start: `autoEndAt` (wann der Server sie beendet), `maxAutoEndAt` (das späteste Ende, auf das verlängert werden kann; `null` ohne maximale Sitzungsdauer, dann gilt die Grenze von 30 Tagen) und `estimatedDurationMinutes`. Spätere Änderungen der Ressourceneinstellungen ändern laufende Sitzungen nicht.

**Starten.** `POST /api/resources/{resourceId}/usage/start` akzeptiert das optionale `estimatedDurationMinutes` (1–43200). Bei Ressourcen ohne verlangte Schätzung wird es ignoriert. Fehler sind `400` mit einem maschinenlesbaren `code`:

| Code                                        | Bedeutung                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_DURATION_ESTIMATE_REQUIRED`        | Die Ressource verlangt eine Schätzung und die Anfrage hat keine. Der Body nennt `maxSessionDurationMinutes` (oder `null`). |
| `SESSION_DURATION_ESTIMATE_EXCEEDS_MAXIMUM` | Die Schätzung liegt über der maximalen Sitzungsdauer.                                                                      |

> [!WARNING]
> API-Token- und MCP-Clients, die Sitzungen starten, scheitern mit `SESSION_DURATION_ESTIMATE_REQUIRED` bei jeder Ressource, bei der ein Admin **Dauerschätzung verlangen** einschaltet. Senden Sie dort `estimatedDurationMinutes`. Das gilt auch für eine Anfrage auf einen beaufsichtigten Start (`POST /api/resources/{resourceId}/usage/supervision/request`): Der Server prüft die Schätzung bei der Anfrage, nicht erst bei der Freigabe durch die Aufsicht.

**Verlängern.** `POST /api/resources/{resourceId}/usage/extend` verschiebt `autoEndAt` nach hinten. Der Body enthält `usageId`, `extendByMinutes` oder `toMax`:

```json
{ "usageId": 123, "extendByMinutes": 60 }
```

`usageId` ist optional; `extendByMinutes` ist 60, 120, 240, 360, 720 oder 1440; `toMax` (Boolean) ersetzt es. Ohne `usageId` wird die eigene Sitzung verlängert. Der Sitzungsbesitzer und alle, die die Sitzung beenden dürfen, können sie verlängern. `toMax: true` setzt exakt Start plus maximale Sitzungsdauer. Die Antwort ist die Sitzung mit neuem `autoEndAt`; die Änderung wird im Audit-Log festgehalten (`usage_session.extended`) und an die Web-App und die Leser gesendet. Fehler sind `400` mit einem `code` (oder `403`, wenn Sie die Sitzung nicht beenden dürfen); es wird nichts gekürzt:

| Code                                | Bedeutung                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_EXTENSION_EXCEEDS_MAXIMUM` | Das neue Ende läge nach `maxAutoEndAt` (oder der Grenze von 30 Tagen). Der Body enthält `maxAutoEndAt`.                                                             |
| `SESSION_EXTENSION_NOT_POSSIBLE`    | Die Sitzung hat kein automatisches Ende, ihr Ende ist schon erreicht, die Sitzung wird gerade beendet, oder `toMax` bei einer Maschine ohne maximale Sitzungsdauer. |
| `SESSION_EXTENSION_INVALID`         | Weder ein erlaubtes `extendByMinutes` noch `toMax` wurde gesendet.                                                                                                  |

**Automatisches Ende.** Ein Job beendet Sitzungen, die `autoEndAt` erreicht haben, als System, normalerweise innerhalb einer Minute: Endformulare werden übersprungen, Stopp-Flows laufen, die Abrechnung bleibt unverändert, und die Endnotiz lautet „Automatically ended: maximum session time reached“ oder „Automatically ended: estimated duration elapsed“. Der Audit-Eintrag enthält den Endgrund (`auto_maximum` oder `auto_estimate`).

## Attractap-WebSocket: Sitzungsdauer

Ein Leser meldet in `READER_FIRMWARE_INFO` `capabilities.sessionDuration: true`, wenn er eine Zeiteingabe und Verlängern-Schaltflächen hat. Die Ressourcenliste enthält dann pro Maschine `requireSessionDurationEstimate` und `maxSessionDurationMinutes`. Jede aufgeführte Sitzung kann `autoEndAt` (ISO), `autoEndUtcOffsetMinutes`, `autoEndInSeconds`, `hasMaxSessionTime` und `extendLimitInSeconds` (Sekunden bis zum spätestmöglichen Ende) enthalten, gerechnet ab dem Zeitpunkt, zu dem die Liste erstellt wurde.

`START_RESOURCE_USAGE_SESSION` akzeptiert das optionale `estimatedDurationMinutes`; der Server prüft es wie bei einem Web-Start. Ein Start von einem Leser ohne diese Fähigkeit wird nie wegen einer fehlenden Schätzung abgelehnt: Das Ende ist die maximale Sitzungsdauer, ohne Maximum die Standardschätzung (60 Minuten, wenn nicht gesetzt).

`EXTEND_RESOURCE_USAGE_SESSION` mit `payload: { resourceId, usageId?, extendByMinutes?, toMax?, requestId? }` verlängert die Sitzung des Karteninhabers nach denselben Identitätsregeln wie ein Stopp. Die Antwort ist `{ success: true, usageId }` oder `{ error }` mit den oben genannten Codes. Der Leser erhält eine neue Ressourcenliste, auch wenn die Sitzung anderswo verlängert wurde.

## Projektwechsel

`POST /api/resources/{resourceId}/usage/sessions/active/project` ordnet Ihre eigene laufende Maschinensitzung einem anderen Ihrer Projekte oder keinem Projekt zu, ohne die Maschine anzuhalten (siehe [Das Projekt einer laufenden Sitzung wechseln](resources/usage-tracking.md#das-projekt-einer-laufenden-sitzung-wechseln)). Der Inhalt:

```json
{ "mode": "whole-session", "projectId": 12, "usageId": 123, "formSubmissions": [] }
```

`mode` ist erforderlich und hat keinen Standardwert:

| `mode`          | Was passiert                                                                                                                                                              | Antwort (`201`)                                                      | Formulare und Flow-Auslöser                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `whole-session` | Nur das Projekt des laufenden Nutzungseintrags ändert sich. Nichts wird abgelesen oder abgerechnet. Frühere Abschnitte einer aufgeteilten Sitzung behalten ihre Projekte. | Derselbe Eintrag                                                     | `project-reassign`, `input.resource.usage.project-reassigned` |
| `split`         | Der laufende Eintrag endet und behält sein Projekt; im selben Augenblick beginnt eine Fortsetzung.                                                                        | Die Fortsetzung; ihr `previousUsageId` nennt den beendeten Abschnitt | `project-switch`, `input.resource.usage.project-switched`     |

`projectId` ist ein Projekt, in dem Sie Mitglied sind, oder `null` für kein Projekt. `usageId` ist optional und benennt die laufende Sitzung, damit eine inzwischen beendete oder aufgeteilte Sitzung nicht mit ihrer Nachfolgerin verwechselt wird. `formSubmissions` beantwortet die für die Aktion der gewählten Art erforderlichen Formulare. Schlägt ein erforderlicher Flow oder bei `split` eine Zählerablesung oder die Guthabenprüfung fehl, ändert sich nichts. Für beendete Sitzungen gilt weiterhin `PUT /api/resources/{resourceId}/usage/sessions/{usageId}/project`. Fehler:

| Status | Bedeutung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `mode` fehlt oder ist unbekannt, `projectId` fehlt oder ist keine positive ganze Zahl, die Sitzung gehört bereits zu diesem Projekt, sie ist keine laufende Maschinensitzung, ein erforderliches Formular fehlt oder ein Flow ist fehlgeschlagen (`FLOW_EXECUTION_ERROR`). Bei `split` zusätzlich: Das Guthaben reicht nicht für eine neue Sitzung (wenn die Ressource eine Aufteilung wie eine solche abrechnet), oder ein abgerechneter Zähler war nicht lesbar (`METER_SWITCH_FAILED`). |
| `403`  | Die mit `usageId` benannte Sitzung gehört jemand anderem (nur die Person, der sie gehört, kann sie ändern), oder die Netzwerkbeschränkung für den Sitzungsstart greift.                                                                                                                                                                                                                                                                                                                    |
| `404`  | Keine laufende Sitzung von Ihnen an der Ressource, oder das Projekt existiert nicht bzw. Sie sind kein Mitglied.                                                                                                                                                                                                                                                                                                                                                                           |
| `409`  | Eine andere Änderung an den Sitzungen der Maschine läuft gerade, oder die Sitzung hat sich während des Wechsels geändert. Versuchen Sie es erneut.                                                                                                                                                                                                                                                                                                                                         |

`GET /api/billing/usages/{usageId}/running-part` liefert, wie der laufende Abschnitt einer Fortsetzung abgerechnet wird, um seine Kosten zu schätzen: `flatCredits` (die Gebühr pro Nutzung dieses Abschnitts, `0`, wenn ein früherer Abschnitt sie bezahlt hat), `roundingStartTime` (ab hier werden Minuten gezählt) und `priorCredits` (was frühere Abschnitte derselben Rundung berechnet haben). Es antwortet der Person, der die Sitzung gehört, Abrechnungs- und Ressourcenverwaltenden; allen anderen und für eine nicht laufende Sitzung antwortet es mit `404`.

## Attractap-WebSocket: Projektwechsel

Ein Leser meldet in `READER_FIRMWARE_INFO` `capabilities.projectSwitch: true`, wenn er das Projekt einer laufenden Sitzung wechseln kann. Nur solche Leser erhalten die folgenden Felder und dürfen das Ereignis senden; andere werden mit `PROJECT_SWITCH_NOT_SUPPORTED` abgewiesen.

| Richtung       | Ereignis                 | Payload                                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server → Leser | `RESOURCE_LIST`          | pro Maschine mit einer laufenden Sitzung des Karteninhabers: `canSwitchProject: true`, `ownProjectId` (Zahl oder `null`), `ownProjectName` (Text oder `null`) und `ownSessionContinued` (ob der laufende Eintrag eine Aufteilung fortsetzt). Fehlt, wenn die Sitzung kein Projekt hat und der Karteninhaber keines zum Wechseln hat. |
| Leser → Server | `SWITCH_SESSION_PROJECT` | `resourceId`, `usageId` (die angezeigte laufende Sitzung), `mode` (`whole-session` oder `split`, erforderlich), `projectId` (Zahl oder `null` für kein Projekt), `cardSessionId`, `requestId`                                                                                                                                        |
| Server → Leser | `SWITCH_SESSION_PROJECT` | `success: true` mit `usageId` (der laufende Eintrag: bei `whole-session` unverändert, bei `split` die Fortsetzung) und `projectName` (oder `null`), oder `error`                                                                                                                                                                     |

Fehlercodes: `PROJECT_SWITCH_NOT_SUPPORTED`, `INVALID_PROJECT_ID`, `INVALID_PROJECT_CHANGE_MODE`, `USER_NOT_FOUND`, `INSUFFICIENT_BALANCE` (mit `sumUpEnabled`), `METER_SWITCH_FAILED`, `FLOW_EXECUTION_ERROR`, `PROJECT_SWITCH_SESSION_CHANGED` (die benannte Sitzung wurde anderswo aufgeteilt, und eine Fortsetzung des Karteninhabers läuft), `NoOwnActiveSessionError` (keine Sitzung des Karteninhabers läuft mehr); jede andere Ablehnung enthält die Meldung des Servers. Erforderliche Formulare der gewählten Art laufen über denselben Formularaustausch wie ein Start. Nach einer Ablehnung erhält der Leser eine neue Zeile der Ressource, nach einem Wechsel, ob dort oder anderswo, eine neue Ressourcenliste.

## Clients neu generieren

Nach Änderungen an API-Endpunkten müssen die Client-Bibliotheken neu generiert werden, um sie mit dem Backend synchron zu halten. Die genauen Regenerierungsbefehle finden Sie in den Build-Skripten des Projekts.

## Siehe auch

- [Entwickler-Überblick](developer/overview.md) – Erste Schritte
- [Architektur](developer/architecture.md) – Projektstruktur
- [Mitwirken](developer/contributing.md) – So können Sie beitragen
