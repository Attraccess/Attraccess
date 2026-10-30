# Matter: Architektur

> **Nur Grundlage.** Dieses Release legt das Fundament für Matter-Unterstützung: einen versionierten Vertrag (Contract), einen eigenständigen Sidecar mit Health-, Versions- und Event-Stream-Endpunkten und ein minimales installierbares Plugin. Es kann Geräte **nicht** in Betrieb nehmen (Commissioning), nicht auflisten, keine Befehle senden, Thread nicht verwalten und keine Firmware-Updates einspielen. Planen Sie keine Gerätesteuerung damit. Diese Funktionen folgen in späteren Tickets (siehe [Wie es weitergeht](#wie-es-weitergeht)).

## Plugin plus Sidecar

Matter wird in zwei zusammenarbeitenden Teilen ausgeliefert, nicht als eingebauter Attraccess-Code:

- **Das Matter-Plugin** (`apps/plugins/matter`) ist ein installierbares Attraccess-Plugin. In diesem Release besteht es nur aus dem Backend und ist leer: keine Routen, keine Berechtigungen, keine Datenbankmigrationen, kein Frontend und **keine Verbindung zum Sidecar**.
- **Der Matter-Sidecar** (`apps/matter-sidecar`) ist ein eigener Node.js-Prozess. Nur er lädt [matter.js](https://github.com/project-chip/matter.js) (`@matter/main`, auf ein exaktes Release festgelegt). Er startet und läuft ohne die Attraccess-API, ohne Datenbank, ohne Matter-Fabric und ohne in Betrieb genommenes Gerät.

Eine gemeinsame Bibliothek, `libs/matter-contract`, definiert jede Anfrage, Antwort und jedes Event genau einmal, mit Laufzeitvalidierung (Zod). Sidecar und Plugin verwenden sie beide. Sie importiert niemals matter.js, Core-Code, Datenbank-Entitäten oder Plugins.

Weil der Sidecar ein getrennter Prozess ist, kann ein Absturz, Neustart oder Versionsproblem des Sidecars Attraccess nicht beenden. Lehnt Attraccess das Plugin ab (zum Beispiel bei nicht passender Host-Version), laufen Core und andere Plugins weiter.

## Eine Wire-Version, strikte Release-Kombinationen

Es gibt genau **eine** Wire-Protokollversion: `1`. Es gibt keine Schemas früherer Versionen, keine Migrationen, keine Übersetzungsschichten und keine Fallback-Aushandlung. Eine Anfrage oder ein WebSocket-Upgrade mit fehlender, fehlerhafter oder nicht unterstützter Wire-Version wird abgelehnt, bevor ein Handler läuft.

Eine passende Wire-Version genügt nicht. Attraccess, das Matter-Plugin und der Sidecar müssen eine **unterstützte Kombination** bilden. Die einzige maßgebliche Tabelle ist `COMPATIBILITY_TABLE` in `libs/matter-contract/src/compatibility.ts`:

| Komponente | Unterstützt |
| --- | --- |
| Wire-Version | `1` |
| Attraccess | `^1.11.0` (Vorabversionen einer passenden Version werden akzeptiert) |
| Matter-Plugin | genau `0.1.0-alpha.0` |
| Matter-Sidecar | genau `0.1.0-alpha.0` |
| matter.js | genau `0.18.0` (Plugin und Sidecar teilen sich ein Release) |

`attraccess.host` (`package.json`) und `attraccessVersion.min` (`plugin.json`) des Plugins werden aus derselben Tabelle abgeleitet; ein Test prüft, dass sie übereinstimmen. Jedes neue Plugin- oder Sidecar-Release braucht eine Tabellenaktualisierung, sonst lehnt der Sidecar es ab. Der Attraccess-Bereich ist bewusst ein Bereich: Ein neues Attraccess-1.x-Release erfordert nicht automatisch ein Sidecar-Release.

Release-Header sind Kompatibilitätsinformationen, **keine Authentifizierung**.

## Versionierter REST- und WebSocket-Vertrag

Der Vertrag umfasst acht Funktionsfamilien: `health`, `fabric`, `commissioning`, `inventory`, `commands`, `subscriptions`, `thread` und `ota`. Operationen für noch nicht implementierte Familien sind bereits definiert und prüfen ihre Eingaben, spätere Tickets müssen also nur das Verhalten ergänzen.

Unversionierte Endpunkte (`/health/live`, `/health/ready`, `/version`) brauchen keine Header, damit Betreiber Probleme untersuchen können. Alles unter `/v1/` braucht diese Header:

| Header | Bedeutung |
| --- | --- |
| `X-Matter-Wire-Version` | `1` |
| `X-Attraccess-Version` | das laufende Attraccess-Release |
| `X-Matter-Plugin-Version` | das Plugin-Release |
| `X-Matter-Sidecar-Version` | das Sidecar-Release, das der Aufrufer erwartet |

Optional: `X-Correlation-Id` (eine UUID; sonst wird eine erzeugt) und `X-Request-Deadline-Ms`. Unbekannte versionierte Pfade (zum Beispiel `/v2/...`) liefern 404 und fallen nie auf `/v1` zurück.

Bezeichner, die Matter als 64-Bit definiert (Node- und Fabric-IDs), werden als Dezimalzeichenfolgen übertragen. matter.js-Objekte verlassen den Prozess nie.

## Fehler und Fähigkeiten

Jeder Fehler nutzt einen Umschlag: `{ "error": { "code", "message", "correlationId", "retryable", "outcome"?, "details"? } }`.

| Code | HTTP | Bedeutung |
| --- | --- | --- |
| `validation_failed` | 400 | Ungültige Pfadparameter, ungültiger Body oder ungültige WebSocket-Nachricht |
| `forbidden_origin` | 403 | Browser-`Origin` oder `Host`, der nicht Loopback ist |
| `not_found` / `method_not_allowed` | 404 / 405 | Unbekannter Pfad oder unbekannte Methode |
| `incompatible_release` | 409 | Nicht unterstützte Release-Kombination |
| `reconciliation_required` | 409 | Wiedergabe unmöglich (siehe unten) |
| `payload_too_large` | 413 | Body über dem Limit |
| `unsupported_wire_version` | 426 | Wire-Version fehlt, ist fehlerhaft oder nicht `1` |
| `internal_error` | 500 | Unerwarteter Fehler; es wird kein interner Text zurückgegeben |
| `unsupported_capability` | 501 | Die Familie ist definiert, aber nicht verfügbar |
| `sidecar_unavailable` | 503 | Der Sidecar fährt herunter oder (nur WebSocket) es sind bereits 64 Event-Stream-Clients verbunden |
| `timeout` | 504 | Die Frist der Anfrage ist abgelaufen |

`GET /v1/capabilities` listet jede Familie mit `defined`, `available` und, falls nicht verfügbar, einem `reason`. In diesem Release ist nur `health` verfügbar. Eine Anfrage an eine nicht verfügbare Familie wird validiert und dann mit `unsupported_capability` beantwortet. Platzhalter täuschen nie Erfolg vor: kein vorgetäuschtes Commissioning, kein leeres Inventar, das als verbindlich dargestellt wird, kein vorgetäuscht abgeschlossener Befehl.

**Zeitüberschreitungen und physische Befehle.** Angefordertes, akzeptiertes und gemeldetes Ergebnis sind getrennte Werte. Überschreitet eine Anfrage für eine physische Operation ihre Frist, wird das Ergebnis als `uncertain` mit `retryable: false` gemeldet. Ein mehrdeutiger physischer Befehl wird nie automatisch wiederholt.

## Events, Reihenfolge, Wiedergabe und Duplikate

Jedes Event trägt Event-ID, Schemaversion, Zeitstempel, Korrelationskontext, Stream-Instanz-ID und Sequenznummer. Events, die der Sidecar selbst auslöst, tragen einen Korrelationskontext mit leeren Initiator-Feldern. Die ersten Lifecycle- und Capability-Events nutzen denselben Umschlag wie künftige Feature-Events.

- **Reihenfolge** ist nur innerhalb eines Sidecar-Laufs garantiert (eine Stream-Instanz-ID). Über Neustarts hinweg wird keine Reihenfolge zugesichert.
- **Die Zustellung ist mindestens einmal.** Konsumenten müssen Duplikate anhand der Event-ID verwerfen.
- **Fortsetzen.** Ein Client verbindet sich per WebSocket mit `/v1/events`, erhält `hello` mit Stream-Instanz-ID und Head-Cursor und sendet dann `resume` mit optionalem Cursor. Der Server gibt alles nach dem Cursor wieder und läuft ohne Lücke und ohne Duplikat live weiter.
- **Abgleich (Reconciliation).** Ist der Cursor fehlerhaft, abgelaufen, verdrängt, in der Zukunft oder aus einem früheren Sidecar-Lauf, sendet der Server `reconciliation-required` mit `"snapshot": "unavailable"` und schließt die Verbindung. Dieses Fundament hat keinen Snapshot anzubieten und erfindet nie einen.
- **Grenzen.** Die Wiedergabe ist im Speicher nach Anzahl (Standard 1.000 Events) und Alter (Standard 5 Minuten) begrenzt; ungenutzte Events laufen ebenfalls ab.
- **Client-Limit.** Es dürfen höchstens 64 WebSocket-Clients gleichzeitig verbunden sein. Ein weiterer Upgrade wird mit 503 `sidecar_unavailable` abgelehnt. Die Versionsprüfung kommt zuerst: Ein Client mit falscher Version erhält daher immer 409 oder 426, auch wenn das Limit erreicht ist.
- **Zeitlimit für die erste Nachricht.** Ein Client, der nicht innerhalb von 30 Sekunden nach dem Verbinden `resume` sendet, wird mit Code 1008 geschlossen. Ein `ping` zählt nicht: Nur `resume` stoppt den Timer.
- **Langsame Clients.** Jeder Client hat ein Warteschlangenbudget, das auch Fehlernachrichten zählt. Ein Client, der es überschreitet, wird mit Code 1013 geschlossen und aufgefordert, sich mit seinem letzten Cursor neu zu verbinden.
- **Zu große Nachrichten.** Der WebSocket-Parser schließt sie mit Code 1009 (message too big), bevor Anwendungscode sie sieht.

## Sicherheitsgrenzen

- Der Sidecar bindet **nur an Loopback** (`127.0.0.1`). Es gibt keine Option für eine entfernte Bindung.
- Er weist jede Anfrage und jedes Upgrade mit einem Browser-`Origin`-Header oder einem Nicht-Loopback-`Host` ab und bietet kein CORS. Browser sprechen mit Attraccess, nie mit dem Sidecar.
- Er **authentifiziert Aufrufer noch nicht**. Jeder lokale Prozess kann ihn erreichen. Dienstauthentifizierung, TLS und Proxy-Unterstützung folgen mit [ATT-1001](https://linear.app/attraccess/issue/ATT-1001). **Setzen Sie den Sidecar nicht von außen erreichbar ein.**
- Commissioning-Geheimnisse (Setup-Codes), Thread-Dataset-Material und Fabric-Geheimnisse erscheinen nur in Anfragen, nie in Antworten, Events, Health-Ausgaben oder Logs.
- Ein generisches Matter-„On“ kann das Bedienen einer Maschine nicht autorisieren. Entriegeln, Aufschließen oder Einschalten von Geräten erfordert künftig eine eigene Berechtigung plus ausdrückliche Bestätigung. Die Durchsetzung gehört zu den späteren Feature-Tickets.

## Erzeugte Vertragsdokumente

`pnpm nx run matter-contract:export-contracts` schreibt OpenAPI-3.1- und JSON-Schema-Dokumente nach `dist/contracts/matter/` (`openapi.json`, `json-schema.json`). Die Ausgabe ist deterministisch, wird von Git ignoriert und nie eingecheckt. `pnpm nx run matter-contract:test-artifacts` validiert sie mit Beispiel-Payloads.

## Wie es weitergeht

- [ATT-1001](https://linear.app/attraccess/issue/ATT-1001): Plugin-zu-Sidecar-Client, Authentifizierung, TLS, wiederverbindender Konsument.
- [ATT-1000](https://linear.app/attraccess/issue/ATT-1000): Produktives Packaging und Deployment.
- [ATT-998](https://linear.app/attraccess/issue/ATT-998): Fabric-Persistenz, verschlüsseltes Backup und Wiederherstellung.
- Spätere Matter-Feature-Tickets: Commissioning, Geräteinventar, Befehle, Subscriptions, Thread, OTA, Berechtigungen und Audit. Dass ihre Vertragsformen hier definiert sind, liefert diese Funktionen nicht.

Siehe auch die [Betriebsanleitung](operator.md).
