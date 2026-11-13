# Matter: Architektur

<!-- llms-description: Architektur der Matter-Integration: Plugin plus Sidecar, versionierter REST- und WebSocket-Vertrag, Fehler und Events. -->

> **Konnektivität, Datenmodell und Fabric-Persistenz.** Dieses Release legt das Fundament für Matter-Unterstützung: einen versionierten Vertrag (Contract), einen eigenständigen Sidecar mit Health-, Versions- und Event-Stream-Endpunkten, ein Plugin, das sich sicher mit ihm verbindet, das [Gerätedatenmodell](devices/matter/data-model.md) des Plugins (Nodes, Endpoints, Zustand und Lebenszyklus, mit Admin-REST-Endpunkten) und eine dauerhafte Matter-Fabric mit verschlüsseltem [Backup und Wiederherstellung](devices/matter/backup-restore.md). Der Sidecar kann Geräte noch **nicht** in Betrieb nehmen (Commissioning), nicht auflisten, keine Befehle senden, Thread nicht verwalten und keine Firmware-Updates einspielen; das Datenmodell bleibt damit leer, und es gibt keine Geräte-Oberfläche. Planen Sie keine Gerätesteuerung damit. Diese Funktionen folgen in späteren Tickets (siehe [Wie es weitergeht](#wie-es-weitergeht)).

## Plugin plus Sidecar

Matter wird in zwei zusammenarbeitenden Teilen ausgeliefert, nicht als eingebauter Attraccess-Code:

- **Das Matter-Plugin** (`apps/plugins/matter`) ist ein installierbares Attraccess-Plugin. In diesem Release verbindet es sich mit dem Sidecar und bietet eine Admin-Seite (**Geräte → Matter**) für die Verbindungseinstellungen sowie für Fabric, ihre verschlüsselten Backups und die Wiederherstellung. Es führt das [Gerätedatenmodell](devices/matter/data-model.md) (Nodes, Endpoints, Zustand, Lebenszyklus) und gleicht es mit dem Sidecar ab, sobald dieser Nodes auflisten kann; eine Geräte-Oberfläche gibt es noch nicht. Es braucht die Berechtigungen `DATABASE_ACCESS` und `MANAGE_SECRETS`.
- **Der Matter-Sidecar** (`apps/matter-sidecar`) ist ein eigener Node.js-Prozess. Nur er lädt [matter.js](https://github.com/project-chip/matter.js) (`@matter/main`, auf ein exaktes Release festgelegt). Er startet und läuft ohne die Attraccess-API, ohne Datenbank, ohne Matter-Fabric und ohne in Betrieb genommenes Gerät. Sobald ein Administrator die Fabric erzeugt, legt der Sidecar sie in seinem eigenen Speicherverzeichnis (`MATTER_SIDECAR_STORAGE_DIR`) ab und öffnet das Matter-Netzwerk (mDNS und UDP). Er erzeugt, stellt wieder her oder überschreibt nie von sich aus eine Fabric.

Eine gemeinsame Bibliothek, `libs/matter-contract`, definiert jede Anfrage, Antwort und jedes Event genau einmal, mit Laufzeitvalidierung (Zod). Sidecar und Plugin verwenden sie beide. Sie importiert niemals matter.js, Core-Code, Datenbank-Entitäten oder Plugins.

Weil der Sidecar ein getrennter Prozess ist, kann ein Absturz, Neustart oder Versionsproblem des Sidecars Attraccess nicht beenden. Lehnt Attraccess das Plugin ab (zum Beispiel bei nicht passender Host-Version), laufen Core und andere Plugins weiter.

## Eine Wire-Version, strikte Release-Kombinationen

Es gibt genau **eine** Wire-Protokollversion: `1`. Es gibt keine Schemas früherer Versionen, keine Migrationen, keine Übersetzungsschichten und keine Fallback-Aushandlung. Eine Anfrage oder ein WebSocket-Upgrade mit fehlender, fehlerhafter oder nicht unterstützter Wire-Version wird abgelehnt, bevor ein Handler läuft.

Eine passende Wire-Version genügt nicht. Attraccess, das Matter-Plugin und der Sidecar müssen eine **unterstützte Kombination** bilden. Die einzige maßgebliche Tabelle ist `COMPATIBILITY_TABLE` in `libs/matter-contract/src/compatibility.ts`:

| Komponente     | Unterstützt                                                          |
| -------------- | -------------------------------------------------------------------- |
| Wire-Version   | `1`                                                                  |
| Attraccess     | `^1.11.0` (Vorabversionen einer passenden Version werden akzeptiert) |
| Matter-Plugin  | genau `0.4.0-alpha.0`                                                |
| Matter-Sidecar | genau `0.4.0-alpha.0`                                                |
| matter.js      | genau `0.18.0` (Plugin und Sidecar teilen sich ein Release)          |

`attraccess.host` (`package.json`) und `attraccessVersion.min` (`plugin.json`) des Plugins werden aus derselben Tabelle abgeleitet; ein Test prüft, dass sie übereinstimmen. Jedes neue Plugin- oder Sidecar-Release braucht eine Tabellenaktualisierung, sonst lehnt der Sidecar es ab. Der Attraccess-Bereich ist bewusst ein Bereich: Ein neues Attraccess-1.x-Release erfordert nicht automatisch ein Sidecar-Release.

Release-Header sind Kompatibilitätsinformationen, **keine Authentifizierung**; die Authentifizierung ist das Service-Token (siehe [Sicherheitsmodell](#sicherheitsmodell)). Ein nicht passender Sidecar braucht ein Update oder Downgrade.

## Versionierter REST- und WebSocket-Vertrag

Der Vertrag umfasst neun Funktionsfamilien: `health`, `fabric`, `backup`, `commissioning`, `inventory`, `commands`, `subscriptions`, `thread` und `ota`. Operationen für noch nicht implementierte Familien sind bereits definiert und prüfen ihre Eingaben, spätere Tickets müssen also nur das Verhalten ergänzen.

Unversionierte Endpunkte (`/health/live`, `/health/ready`, `/version`) brauchen keine Kompatibilitäts-Header, damit Betreiber Probleme untersuchen können (außer den beiden Health-Probes brauchen sie weiterhin das Token). Alles unter `/v1/` braucht das Token und diese Header:

| Header                     | Bedeutung                                      |
| -------------------------- | ---------------------------------------------- |
| `X-Matter-Wire-Version`    | `1`                                            |
| `X-Attraccess-Version`     | das laufende Attraccess-Release                |
| `X-Matter-Plugin-Version`  | das Plugin-Release                             |
| `X-Matter-Sidecar-Version` | das Sidecar-Release, das der Aufrufer erwartet |

Dazu `Authorization: Bearer <token>` (Pflicht) und optional `X-Correlation-Id` (eine UUID; sonst wird eine erzeugt) und `X-Request-Deadline-Ms`, das die konfigurierte Frist nur verkürzen, nie verlängern kann. Unbekannte versionierte Pfade (zum Beispiel `/v2/...`) liefern 404 und fallen nie auf `/v1` zurück.

Bezeichner, die Matter als 64-Bit definiert (Node- und Fabric-IDs), werden als Dezimalzeichenfolgen übertragen. matter.js-Objekte verlassen den Prozess nie.

## Fehler und Fähigkeiten

Jeder Fehler nutzt einen Umschlag: `{ "error": { "code", "message", "correlationId", "retryable", "outcome"?, "details"? } }`.

| Code                               | HTTP      | Bedeutung                                                                                                                            |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `validation_failed`                | 400       | Ungültige Pfadparameter oder ungültiger Body (zu WebSocket-Nachrichten siehe [Events](#events-reihenfolge-wiedergabe-und-duplikate)) |
| `unauthorized`                     | 401       | Fehlendes, fehlerhaftes oder falsches Service-Token (wird vor jeder Versionsprüfung geprüft)                                         |
| `forbidden_origin`                 | 403       | Browser-`Origin`, oder ein `Host`, der weder Loopback noch in `MATTER_SIDECAR_ALLOWED_HOSTS` ist                                     |
| `insecure_transport`               | 403       | Eine Backup- oder Restore-Anfrage kam über unverschlüsseltes HTTP von einer entfernten Adresse                                       |
| `not_found` / `method_not_allowed` | 404 / 405 | Unbekannter Pfad oder unbekannte Methode                                                                                             |
| `fabric_exists`                    | 409       | Es existiert bereits eine Fabric, daher wird `fabric.create` abgelehnt                                                               |
| `recovery_required`                | 409       | Der Fabric-Speicher braucht eine Recovery-Entscheidung eines Administrators (siehe Abschnitt „Fabric-Zustände“)                      |
| `busy`                             | 409       | Ein Snapshot oder eine Wiederherstellung läuft bereits                                                                               |
| `restore_failed`                   | 409       | Der Restore-Commit hat die Verifikation nicht bestanden; der Sidecar hat seinen vorherigen Speicher zurückgetauscht                  |
| `incompatible_release`             | 409       | Nicht unterstützte Release-Kombination                                                                                               |
| `reconciliation_required`          | 409       | Reserviert; in diesem Release kommt eine unmögliche Wiedergabe als WebSocket-Nachricht (siehe unten)                                 |
| `payload_too_large`                | 413       | Body über dem Limit                                                                                                                  |
| `invalid_backup`                   | 422       | Eine gestagte Backup-Nutzlast ist beschädigt oder inkompatibel                                                                       |
| `unsupported_wire_version`         | 426       | Wire-Version fehlt, ist fehlerhaft oder nicht `1`                                                                                    |
| `internal_error`                   | 500       | Unerwarteter Fehler; es wird kein interner Text zurückgegeben                                                                        |
| `unsupported_capability`           | 501       | Die Familie ist definiert, aber nicht verfügbar                                                                                      |
| `sidecar_unavailable`              | 503       | Der Sidecar fährt herunter oder (nur WebSocket) es sind bereits 64 Event-Stream-Clients verbunden                                    |
| `timeout`                          | 504       | Die Frist der Anfrage ist abgelaufen                                                                                                 |

`GET /v1/capabilities` listet jede Familie mit `defined`, `available` und, falls nicht verfügbar, einem `reason`. In diesem Release sind `health`, `fabric` und `backup` verfügbar. Eine Anfrage an eine nicht verfügbare Familie wird validiert und dann mit `unsupported_capability` beantwortet. Platzhalter täuschen nie Erfolg vor: kein vorgetäuschtes Commissioning, kein leeres Inventar, das als verbindlich dargestellt wird, kein vorgetäuscht abgeschlossener Befehl.

**Zeitüberschreitungen und physische Befehle.** Angefordertes, akzeptiertes und gemeldetes Ergebnis sind getrennte Werte. Überschreitet eine Anfrage für eine physische Operation ihre Frist, wird das Ergebnis als `uncertain` mit `retryable: false` gemeldet. Ein mehrdeutiger physischer Befehl wird nie automatisch wiederholt.

## Fabric-Zustände

Der Sidecar meldet seine Fabric mit `fabricStatus`: `state`, `reason`, `fabricId`, `fabricGeneration`, `rootCertFingerprint`, `storageInstanceId` und `storageSchemaVersion`.

| Zustand             | Bedeutung                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `uninitialized`     | Es existiert keine Fabric. `fabric.create` erzeugt die einzige Controller-Fabric (409 `fabric_exists`, falls es schon eine gibt).           |
| `initialized`       | Eine Fabric existiert, ihr Speicher ist gesund.                                                                                             |
| `recovery_required` | Der Speicher ist unbrauchbar oder inkonsistent; `reason` nennt den Grund. Der Sidecar lehnt `fabric.create` mit 409 `recovery_required` ab. |

`fabricGeneration` steigt mit jeder Änderung der Fabric (Erzeugung `0 → 1`, Wiederherstellung). Bei jeder Änderung sendet der Sidecar `fabric.changed` (`fabricGeneration`, `fabricId`, `state`). Die `storageInstanceId` kennzeichnet ein Speicherverzeichnis, sodass ein vertauschtes oder geleertes Volume erkennbar ist.

Das Plugin führt eine eigene Aufzeichnung der Fabric (ID, Fingerabdruck des Root-Zertifikats, Generation, Storage-Instanz) und vergleicht sie mit den Angaben des Sidecars. Eine Abweichung versetzt das Plugin in einen **Recovery**-Zustand, der jede Plugin-Aktion sperrt, die die Fabric ändert, bis ein Administrator entscheidet. Die erfasste Abweichung ist eine von `sidecar_uninitialized`, `fabric_changed`, `generation_behind`, `generation_ahead`, `storage_instance_changed` oder `sidecar_recovery_required`. Der Administrator kann ein Backup wiederherstellen, die Fabric des Sidecars übernehmen oder eine neue Fabric beginnen (siehe [Backup und Wiederherstellung](devices/matter/backup-restore.md)).

## Backup und zweiphasige Wiederherstellung

Die Familie `backup` hat sechs Operationen (alle unter `/v1/backup/`): `snapshot`, `restore.stage`, `restore.commit`, `restore.rollback`, `restore.finalize` und `restore.abort`. Sie erfordern eine `https`- oder Loopback-Verbindung (sonst `insecure_transport`) und erlauben einen Request-Body bis 64 MiB.

- **`snapshot`** liefert den Speicher des Sidecars als Header plus Base64-Nutzlast. Der Header enthält die Version des Speicherschemas, die Versionen von Sidecar und matter.js, die Fabric-Daten, ein SHA-256 der Nutzlast samt Größe und den Erstellungszeitpunkt. Er braucht eine initialisierte Fabric.
- **Die Wiederherstellung läuft in zwei Phasen**, damit Sidecar und Plugin-Datenbank nie halb wiederhergestellt bleiben:
  1. `restore.stage` prüft die Nutzlast und liefert eine `stageId` plus die Fabric-Daten. Am Livezustand ändert sich nichts (422 `invalid_backup` bei beschädigter oder inkompatibler Nutzlast).
  2. `restore.commit` tauscht den Speicher ein, behält den vorherigen als Rollback-Kopie und verifiziert das Ergebnis. Scheitert die Verifikation, tauscht der Sidecar selbstständig zurück und antwortet mit 409 `restore_failed`. Bei Erfolg setzt er `fabricGeneration` auf `max(gestagt, live) + 1`, setzt Zähler und Node-ID-Vergeber um einen sicheren Abstand weiter und sendet `fabric.changed`.
  3. Danach ersetzt das Plugin seine Tabellen in **einer Datenbanktransaktion**.
  4. `restore.finalize` löscht die Rollback-Kopie, oder `restore.rollback` tauscht den vorherigen Speicher zurück, falls der Plugin-Schritt scheiterte. `restore.abort` verwirft gestagte Daten vor einem Commit.
- **Konsistenzprüfung.** Das Plugin vergleicht bei jeder Verbindung `fabricGeneration` (sowie Fabric-ID und Storage-Instanz) mit seiner Aufzeichnung. Liegt die Generation des Sidecars hinter oder vor der Aufzeichnung des Plugins, zum Beispiel weil nur eine Seite wiederhergestellt wurde, ist das eine Abweichung und löst den oben beschriebenen Recovery-Zustand aus.
- Eine Wiederherstellung auf einen Sidecar in `recovery_required` oder `uninitialized` ist erlaubt. Der Sidecar erzeugt bei einer Wiederherstellung nie eine Fabric.

Das Plugin verpackt diese Operationen in eine verschlüsselte Backup-Datei mit Recovery-Schlüssel; Datei, Schlüssel und Ablauf für Administratoren stehen unter [Backup und Wiederherstellung](devices/matter/backup-restore.md).

## Events, Reihenfolge, Wiedergabe und Duplikate

Jedes Event trägt Event-ID, Schemaversion, Zeitstempel, Korrelationskontext, Stream-Instanz-ID und Sequenznummer. Events, die der Sidecar selbst auslöst, tragen einen Korrelationskontext mit leeren Initiator-Feldern. Die ersten Lifecycle- und Capability-Events nutzen denselben Umschlag wie künftige Feature-Events.

- **Reihenfolge** ist nur innerhalb eines Sidecar-Laufs garantiert (eine Stream-Instanz-ID). Über Neustarts hinweg wird keine Reihenfolge zugesichert.
- **Die Zustellung ist mindestens einmal.** Konsumenten müssen Duplikate anhand der Event-ID verwerfen.
- **Fortsetzen.** Ein Client verbindet sich per WebSocket mit `/v1/events`, erhält `hello` mit Stream-Instanz-ID und Head-Cursor und sendet dann `{"type":"resume","wireVersion":1}` mit optionalem `cursor`. Der Server gibt alles nach dem Cursor wieder und läuft ohne Lücke und ohne Duplikat live weiter.
- **Abgleich (Reconciliation).** Ist der Cursor fehlerhaft, abgelaufen, verdrängt, in der Zukunft oder aus einem früheren Sidecar-Lauf, sendet der Server `reconciliation-required` mit `"snapshot": "unavailable"` und schließt die Verbindung mit Code 1000. Dieses Fundament hat keinen Snapshot anzubieten und erfindet nie einen.
- **Grenzen.** Die Wiedergabe ist im Speicher nach Anzahl (Standard 1.000 Events) und Alter (Standard 5 Minuten) begrenzt; ungenutzte Events laufen ebenfalls ab.
- **Client-Limit.** Es dürfen höchstens 64 WebSocket-Clients gleichzeitig verbunden sein. Ein weiteres Upgrade wird mit 503 `sidecar_unavailable` abgelehnt. Die Versionsprüfung kommt zuerst: Ein Client mit falscher Version erhält daher immer 409 oder 426, auch wenn das Limit erreicht ist.
- **Zeitlimit für die erste Nachricht.** Ein Client, der nicht innerhalb von 30 Sekunden nach dem Verbinden `resume` sendet, wird mit Code 1008 geschlossen. Ein `ping` (`{"type":"ping","wireVersion":1}`, beantwortet mit `pong`) zählt nicht: Nur `resume` stoppt den Timer.
- **Ungültige Nachrichten.** Eine binäre, nicht als JSON lesbare oder nicht vertragsgemäße Nachricht sowie ein zweites `resume` auf derselben Verbindung werden mit einer `error`-Nachricht beantwortet (`validation_failed`, mit der Korrelations-ID des Upgrades), und die Verbindung wird mit Code 1008 geschlossen.
- **Langsame Clients.** Jeder Client hat ein Warteschlangenbudget, das auch Fehlernachrichten und die Wiedergabe nach `resume` zählt. Ein Client, der es überschreitet, wird mit Code 1013 geschlossen und aufgefordert, sich mit seinem letzten Cursor neu zu verbinden. Das Budget sollte größer sein als die Wiedergabe, die ein neu verbundener Client nachholen muss.
- **Zu große Nachrichten.** Der WebSocket-Parser schließt sie mit Code 1009 (message too big), bevor Anwendungscode sie sieht.

## Sicherheitsmodell

Der Sidecar steuert physische Anlagen und vertraut deshalb einem Aufrufer nie allein wegen seiner Netzwerkposition.

- **Dienstauthentifizierung.** Jede Anfrage und jedes WebSocket-Upgrade muss `Authorization: Bearer <token>` tragen. Ausgenommen sind nur `GET /health/live` und `GET /health/ready`: Sie bleiben für Container-Probes anonym und verraten keine Versionen. `/version`, alles unter `/v1/` und das Upgrade auf `/v1/events` brauchen das Token (`/version` braucht weiterhin keine Kompatibilitäts-Header).
- **Das Token** besteht aus 32–512 druckbaren ASCII-Zeichen (erzeugen Sie es mit `openssl rand -base64 48`). Es kommt aus `MATTER_SIDECAR_AUTH_TOKEN` oder `MATTER_SIDECAR_AUTH_TOKEN_FILE`; ein zweites Token (`…_PREVIOUS`) wird während einer Rotation zusätzlich akzeptiert. Ohne Token startet der Sidecar nicht. Tokens werden in konstanter Zeit verglichen. Eine fehlgeschlagene Authentifizierung wird auf Warn-Ebene protokolliert (ratenbegrenzt), nie mit dem Token oder dem Header.
- **Prüfreihenfolge.** Der Sidecar prüft in dieser Reihenfolge: (1) `Origin` und `Host` (403), (2) **Authentifizierung (401)**, (3) Herunterfahren (503, für `/v1` und den Event-Stream), (4) Wire-Version und Release-Kombination (426 / 409), (5) das WebSocket-Client-Limit (503). Ein nicht authentifizierter Aufrufer erfährt daher nichts über Versionen oder die Kompatibilitätstabelle, nicht einmal, ob ein Pfad existiert.
- **Browser.** Eine Anfrage mit Browser-`Origin`-Header wird immer mit 403 abgewiesen, und der Sidecar bietet kein CORS. Browser sprechen mit Attraccess, nie mit dem Sidecar.
- **Bind-Adresse und Host-Allowlist.** Standardmäßig bindet der Sidecar an `127.0.0.1` und akzeptiert nur Loopback-`Host`-Namen. `MATTER_SIDECAR_BIND_HOST` wählt ausdrücklich eine andere Adresse; dann ist `MATTER_SIDECAR_ALLOWED_HOSTS` (kommagetrennte Liste der Hostnamen, die Clients verwenden) Pflicht, und jeder andere `Host` wird mit 403 abgewiesen.
- **TLS.** `MATTER_SIDECAR_TLS_CERT_FILE` und `MATTER_SIDECAR_TLS_KEY_FILE` (beide oder keine) lassen den Sidecar HTTPS und WSS sprechen. Eine Nicht-Loopback-Bindung **ohne** TLS wird beim Start abgelehnt, außer `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true` ist ausdrücklich gesetzt. Das ist nur für ein vertrauenswürdiges Container-Netz oder einen TLS-terminierenden Reverse-Proxy gedacht; der Sidecar protokolliert dann eine Warnung. Zertifikate werden beim Start gelesen; eine Erneuerung braucht einen Neustart. Gegenseitiges TLS (mTLS) wird nicht unterstützt.
- Commissioning-Geheimnisse (Setup-Codes), Thread-Dataset-Material und Fabric-Geheimnisse erscheinen nur in Anfragen, nie in Antworten, Events, Health-Ausgaben oder Logs. Die einzige Ausnahme ist ein Backup-Snapshot, der den Fabric-Speicher bewusst enthält; er wird über unverschlüsseltes HTTP von einer entfernten Adresse abgelehnt, und das Plugin verschlüsselt ihn vor dem Speichern.
- Ein generisches Matter-„On“ kann das Bedienen einer Maschine nicht autorisieren. Entriegeln, Aufschließen oder Einschalten von Geräten erfordert künftig eine eigene Berechtigung plus ausdrückliche Bestätigung. Die Durchsetzung gehört zu den späteren Feature-Tickets.

## Das Plugin verbindet sich mit dem Sidecar

Ein Administrator richtet die Verbindung in der Weboberfläche ein (**Geräte → Matter**): Sidecar-URL, Service-Token und optional ein CA-Zertifikat. Diese CA wird dem Standard-Truststore von Node.js hinzugefügt (den mitgelieferten Stammzertifikaten plus etwaigen `NODE_EXTRA_CA_CERTS`) und ersetzt ihn nicht. Die URL darf `http` oder `https` sein und ein Pfadpräfix für einen Reverse-Proxy tragen (`https://host/prefix` führt zu `/prefix/v1/...`). Das Token wird vom Host verschlüsselt gespeichert (`MANAGE_SECRETS`), in einer Plugin-Tabelle (`DATABASE_ACCESS`), nie wieder angezeigt und erscheint nie in Logs, Fehlern, Statusantworten oder Audit-Einträgen. Nur Benutzer mit der Berechtigung `system.plugins.manage` können die Einstellungen lesen oder ändern (eine eigene Matter-Berechtigung folgt mit [ATT-1003](https://linear.app/attraccess/issue/ATT-1003)). Jede Änderung wird ohne Geheimnisse im Audit-Log festgehalten.

Das Plugin startet die Verbindung, ohne auf den Sidecar zu warten. **Ein fehlender, neu startender, ablehnender oder inkompatibler Sidecar hindert weder Attraccess noch das Plugin am Laden**; stattdessen zeigt das Plugin einen eindeutigen Zustand:

| Zustand                      | Bedeutung                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not_configured`             | Noch keine URL und kein Token gespeichert.                                                                                                                                                                                                                         |
| `connecting`                 | Ein Verbindungsversuch läuft.                                                                                                                                                                                                                                      |
| `connected`                  | Der Sidecar antwortet, die Kombination wird unterstützt und der Event-Stream ist offen.                                                                                                                                                                            |
| `degraded` / `unavailable`   | Verbindung verweigert, DNS-Fehler, Netzwerkfehler, Zeitüberschreitung oder 503. Wird automatisch wiederholt.                                                                                                                                                       |
| `degraded` / `unauthorized`  | Der Sidecar antwortet 401. Prüfen Sie das Token.                                                                                                                                                                                                                   |
| `degraded` / `incompatible`  | 409 oder 426, oder das Attraccess- oder Plugin-Release steht nicht in der Tabelle (oder Attraccess meldet seine Version nicht). Wechseln Sie auf eine unterstützte Kombination.                                                                                    |
| `degraded` / `misconfigured` | Ungültige URL oder ungültiges Pfadpräfix, ungültiges CA-Zertifikat oder TLS-Fehler, oder ein `Host`-Name, den der Sidecar ablehnt (tragen Sie ihn in `MATTER_SIDECAR_ALLOWED_HOSTS` ein). Die Zertifikatsprüfung ist immer aktiv; sie lässt sich nicht abschalten. |

**Wiederverbinden.** Nach einem Fehler versucht das Plugin es mit exponentiellem Backoff und vollem Jitter erneut (Basis 1 s, Obergrenze 60 s). Der Backoff beginnt von vorn, wenn eine Verbindung 30 Sekunden stabil war. `unauthorized`, `incompatible` und `misconfigured` wiederholen mit der Obergrenze von 60 s. Das Speichern oder Entfernen der Einstellungen verbindet sofort neu, ohne Attraccess-Neustart. Anfragen werden **nie automatisch wiederholt**; nur die Verbindungsprüfung (`/version`, `/v1/capabilities`) wiederholt sich.

**Event-Stream.** Das Plugin sendet nach jedem Wiederverbinden `resume` mit seinem letzten Cursor, verwirft Events, deren ID es schon ausgeliefert hat (begrenzte Menge von 2.000 IDs) und erkennt eine Sequenzlücke innerhalb einer Stream-Instanz. Eine neue Stream-Instanz ohne Cursor ist ein Neustart, keine Lücke. Bei `reconciliation-required` (abgelaufener, verdrängter, zukünftiger oder aus einem früheren Lauf stammender Cursor) oder bei einer Lücke verwirft es Cursor und gesehene IDs, meldet den Matter-Funktionen im Plugin „Abgleich erforderlich“ und verbindet frisch neu; nichts wird stillschweigend übersprungen. Es sendet alle 30 Sekunden ein Ping und verbindet neu, wenn zwei Intervalle lang gar nichts ankommt – das erkennt halb offene Verbindungen. Nach einem 1013-Close (langsamer Client) verbindet es mit dem letzten Cursor neu.

**Anfragen** tragen die Wire-Version, `X-Attraccess-Version`, `X-Matter-Plugin-Version`, `X-Matter-Sidecar-Version` (das Sidecar-Release, das die Tabelle dem Plugin zuordnet), `X-Correlation-Id` und `X-Request-Deadline-Ms`. Antworten werden gegen den Vertrag validiert. Eine Zeitüberschreitung bei einer physischen Operation wird als `uncertain` gemeldet.

**Eine Wire-Version.** Es gibt keinen Fallback und keine Unterstützung früherer Versionen. Ein Sidecar mit anderer Version oder anderem Release **braucht ein Update oder Downgrade auf die unterstützte Kombination**.

## Erzeugte Vertragsdokumente

`pnpm nx run matter-contract:export-contracts` schreibt OpenAPI-3.1- und JSON-Schema-Dokumente nach `dist/contracts/matter/` (`openapi.json`, `json-schema.json`). Die Ausgabe ist deterministisch, wird von Git ignoriert und nie eingecheckt. `pnpm nx run matter-contract:test-artifacts` validiert sie mit Beispiel-Payloads.

## Wie es weitergeht

- [ATT-1000](https://linear.app/attraccess/issue/ATT-1000): Produktives Packaging und Deployment.
- Spätere Matter-Feature-Tickets: Commissioning, das Geräteinventar des Sidecars, Befehle und Subscriptions, Geräte-Oberfläche und Flow-Nodes, Thread, OTA und eine eigene Berechtigung. Der Vertrag definiert bereits die Formen von Inventar, `device.state` und `command.outcome`, und das Plugin speichert und gleicht sie ab (siehe [Datenmodell](devices/matter/data-model.md)), aber der Sidecar antwortet für diese Familien weiterhin mit `unsupported_capability`.

Siehe auch die [Betriebsanleitung](devices/matter/operator.md).
