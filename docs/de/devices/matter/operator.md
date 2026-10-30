# Matter: Betriebsanleitung

> **Nur Grundlage.** Der Sidecar lässt sich bauen, starten und überwachen, steuert aber noch keine Geräte. Lesen Sie zuerst die [Architektur](devices/matter/architecture.md).

## Bauen und starten

```bash
pnpm nx run matter-sidecar:build
node dist/apps/matter-sidecar/main.js
```

Der Build bündelt den Sidecar in `dist/apps/matter-sidecar/main.js` und stempelt die aktuelle Git-Revision ein. matter.js wird zur Laufzeit aus `node_modules` geladen, es läuft also das festgelegte Release. Erforderlich ist Node.js `>=24.22.1 <25`.

Beim Start lädt der Sidecar matter.js, öffnet aber keine Matter-Ports (UDP 5540, mDNS), schreibt keinen Matter-Speicher und erzeugt keine Fabric. Er lauscht nur auf `127.0.0.1`.

## Konfiguration

Alle Einstellungen sind optionale Umgebungsvariablen und werden validiert, bevor der Sidecar lauscht. Eine leere Variable gilt als nicht gesetzt. Ein Wert außerhalb seines Bereichs beendet nur den Sidecar und nennt die zu korrigierende Variable.

| Variable | Standard | Bereich | Bedeutung |
| --- | --- | --- | --- |
| `MATTER_SIDECAR_PORT` | `8581` | `0`–`65535` | TCP-Port auf Loopback (`0` wählt einen freien Port) |
| `MATTER_SIDECAR_MAX_MESSAGE_BYTES` | `1048576` | `1`–`16777216` | Größter Request-Body und größte WebSocket-Nachricht |
| `MATTER_SIDECAR_REQUEST_DEADLINE_MS` | `10000` | `1`–`60000` | Frist einer Anfrage |
| `MATTER_SIDECAR_SHUTDOWN_GRACE_MS` | `5000` | `1`–`60000` | Zeit für das Herunterfahren |
| `MATTER_SIDECAR_REPLAY_MAX_EVENTS` | `1000` | `1`–`100000` | Für die Wiedergabe vorgehaltene Events |
| `MATTER_SIDECAR_REPLAY_MAX_AGE_MS` | `300000` | `1`–`86400000` | Höchstalter wiedergebbarer Events |
| `MATTER_SIDECAR_CLIENT_QUEUE_BYTES` | `1048576` | `1`–`67108864` | Warteschlangenbudget je WebSocket-Client, einschließlich der Wiedergabe nach einem Neuverbinden |

Es gibt keine Einstellung für die Bindeadresse. Der Sidecar lauscht nie auf etwas anderem als Loopback.

## Health und Version

```bash
curl http://127.0.0.1:8581/health/live
curl http://127.0.0.1:8581/health/ready
curl http://127.0.0.1:8581/version
```

- `/health/live` antwortet `{"status":"live"}`, solange der Prozess läuft.
- `/health/ready` antwortet mit 200 und `"status":"ready"`, sobald Konfiguration, matter.js-Start und Transport erfolgreich waren. Sonst antwortet es mit 503 und `"starting"` oder `"draining"`. Das Feld `fabric` (in diesem Release `uninitialized`) wird getrennt gemeldet und beeinflusst die Bereitschaft nie.
- `/version` meldet `build.version` und `build.commit` (die Git-Revision, aus der gebaut wurde), `sidecar` (das Sidecar-Release), `matterJs` (das tatsächlich geladene matter.js-Release), `storageSchemaVersion` (`1`; die Meldung fügt keine Persistenz hinzu) und `wireVersion` (`1`).

Diese Endpunkte brauchen keine Kompatibilitäts-Header und bleiben daher erreichbar, während Sie ein Versionsproblem untersuchen.

## Eine inkompatible Kombination

Eine `/v1/`-Anfrage oder ein WebSocket-Upgrade auf `/v1/events` mit nicht unterstützter Release-Kombination scheitert mit HTTP 409:

```json
{
  "error": {
    "code": "incompatible_release",
    "message": "Attraccess, the Matter plugin and the Matter sidecar are not a supported combination. Upgrade or downgrade one of them to a supported combination.",
    "correlationId": "5a1f6c0e-6f55-4a53-9a6e-2c6d6b0f5b1c",
    "retryable": false,
    "details": {
      "received": { "wireVersion": 1, "attraccess": "1.10.0", "plugin": "0.1.0-alpha.0", "sidecar": "0.1.0-alpha.0" },
      "problems": [],
      "running": { "sidecar": "0.1.0-alpha.0", "matterJs": "0.18.0" },
      "supported": [ { "wireVersion": 1, "attraccess": "^1.11.0", "plugin": "0.1.0-alpha.0", "sidecar": "0.1.0-alpha.0", "matterJs": "0.18.0" } ]
    }
  }
}
```

Die Fehlermeldung ist englisch, weil sie Teil des Vertrags ist. Fehlerhafte oder fehlende Release-Werte werden nie zurückgegeben; sie erscheinen als `null` in `received` und stehen in `problems` (zum Beispiel `plugin:malformed`).

So beheben Sie es: Vergleichen Sie `received` mit `supported` und **aktualisieren oder downgraden** Sie Attraccess, das Matter-Plugin oder den Sidecar, bis alle drei einer unterstützten Kombination entsprechen. Mit `/version` sehen Sie, was der Sidecar ausführt. Eine falsche Wire-Version liefert HTTP 426 und nennt die unterstützte Version.

## Herunterfahren

`SIGTERM` und `SIGINT` fahren den Sidecar geordnet herunter: Er meldet sich als nicht bereit, nimmt keine neue Arbeit an, schließt WebSocket-Clients mit Code 1001, beendet laufende Anfragen und endet innerhalb der Schonfrist. Wiederholte Signale sind unbedenklich. Ein Fehler einer Anfrage oder eines Clients beendet den Prozess nie, und ein fataler Fehler beendet nur den Sidecar, mit einer verständlichen Meldung auf stderr. Ist der Port bereits belegt, rät die Meldung, `MATTER_SIDECAR_PORT` auf einen freien Port zu setzen. Attraccess läuft weiter.

## Sicherheitshinweise

- Der Sidecar authentifiziert Aufrufer noch nicht. Jeder lokale Prozess kann ihn aufrufen. **Setzen Sie ihn nicht von außen erreichbar ein** und veröffentlichen Sie ihn nicht über eine Container-Portweiterleitung, einen gemeinsam genutzten Host oder einen öffentlichen Reverse-Proxy, bis Dienstauthentifizierung ([ATT-1001](https://linear.app/attraccess/issue/ATT-1001)) existiert.
- Anfragen mit Browser-`Origin`-Header oder Nicht-Loopback-`Host` werden mit HTTP 403 abgewiesen.
- Setup-Codes, Thread-Datasets und Fabric-Geheimnisse erscheinen nie in Logs, Events oder Health-Ausgaben.

## Prüfungen und erzeugte Dokumente

```bash
pnpm nx run-many -t lint,typecheck,test -p matter-contract,matter-sidecar
pnpm nx run matter-sidecar:test-integration   # echtes lokales HTTP und WebSocket, simulierte Matter-Funktionen
pnpm nx run matter-sidecar:test-built         # der gebaute Prozess
pnpm nx run matter-contract:export-contracts  # schreibt dist/contracts/matter/
pnpm nx run matter-contract:test-artifacts
pnpm nx run-many -t lint,test,e2e,pack-test -p plugin-matter
```

Die Tests simulieren Matter-Funktionen und -Geräte. Echtes Commissioning, echte Geräte, Thread und OTA bleiben bis zu späteren Tickets ungetestet.
