# Matter-Architektur

Matter besteht aus einem installierbaren Backend-Plugin und einem separaten Node.js-Sidecar. Attraccess Core lädt Plugins. Das Plugin wird die Host-Integration übernehmen; der Sidecar die Matter-Protokoll- und Gerätearbeit. Ein Sidecar-Absturz darf Core oder andere Plugins nicht stoppen.

Dieses Fundament installiert ein Plugin-Modul ohne Controller, Berechtigungen, Migrationen, Frontend oder Hintergrundverbindungen. Der Sidecar initialisiert die festgelegte offizielle matter.js-Node-Plattform und native Kryptografie, ohne eine Fabric zu erstellen, Funk-/Geräteverbindungen zu öffnen oder Speicher zu initialisieren. Inbetriebnahme, Inventar, Befehle, Abonnements, Thread und OTA sind **noch nicht verfügbar**. Ihre Anfrage-, Antwort- und Ereignisformen sind für spätere Implementierungen definiert; gültige Anfragen liefern aktuell `501 UNSUPPORTED_CAPABILITY`. Das Inventar liefert keinen erfundenen leeren, maßgeblichen Snapshot.

## Versionen und Grenzen

Es gibt genau ein Nachrichtenformat: Version `1`. Unterstützte Releases:

| Attraccess | Matter-Plugin | Matter-Sidecar | matter.js |
| ---------- | ------------- | -------------- | --------- |
| 1.10.0     | 0.1.0         | 0.1.0          | 0.17.9    |

Eine passende Nachrichtenformat-Version allein reicht nicht. Der Sidecar prüft Host- und Plugin-Versionsheader gegen sein eigenes Release. Unbekannte/ungültige Releases werden vor einer Operation oder dem WebSocket-Upgrade abgelehnt. Das Plugin-Paket verlangt eine exakte Host-Version; der vorhandene Plugin-Loader prüft sie separat. Komponenten auf diese Kombination aktualisieren oder zurückstufen. Es gibt keine Migrationen, älteren Schemas, Umwandlungen oder Kompatibilitäts-Fallbacks.

`libs/matter-contract/package.json` enthält die maßgebliche Release-Richtlinie. Build-Prüfungen gleichen das Host-Paket, die Plugin-Manifeste, das Sidecar-Paket und die festgelegten Abhängigkeiten damit ab. Release-Änderungen müssen diese Angaben gemeinsam aktualisieren. Die portable Vertragsbibliothek trägt das öffentliche SDK-Tag; Plugins dürfen diese Bibliothek und öffentliche SDKs nutzen, keine Core-Interna. matter.js-Imports bleiben im Sidecar. Die Vertragsvalidierung wird in das Plugin-Artefakt eingebunden.

Die akzeptierte Architektur und das einzelne Nachrichtenformat ersetzen ältere Angaben zu eingebautem Matter und vorherigen Formatversionen in ATT-70 und verwandten Tickets. Diese Beschreibungen können noch veraltet sein; diese Aufgabe ändert keine Geschwistertickets.

## Vertrag und Fähigkeiten

`libs/matter-contract/src/` ist die ausführbare Quelle für Laufzeitvalidierung und abgeleitete TypeScript-Typen. Fabric-/Node-IDs und Ereignisnummern verwenden genau 16 kleine Hexadezimalzeichen und erhalten so 64 Bit. Endpoints, Cluster, Attribute und Befehle verwenden begrenzte Ganzzahladressen. Operationen enthalten UUIDs für Operation/Abbruch und UTC-Fristen mit Millisekunden. Anfragen, Antworten und Anwendungsereignisse sind strikte Objekte.

Operative REST-Routen liegen unter `/v1`, der Ereignis-Socket unter `/v1/events`. Jede operative Anfrage und jedes WebSocket-Upgrade benötigt:

| Header                    | Wert                      |
| ------------------------- | ------------------------- |
| `x-matter-wire-version`   | `1`                       |
| `x-attraccess-version`    | `1.10.0`                  |
| `x-matter-plugin-version` | `0.1.0`                   |
| `x-request-id`            | UUID zur Anfragezuordnung |

Diese Header beschreiben Kompatibilität; sie sind **keine Authentifizierung**. Diagnose bleibt ohne sie erreichbar. Browseranfragen/-Upgrades mit `Origin` werden auch für Diagnose abgelehnt. Es gibt keine CORS-Freigabe oder öffentliche Proxy-Route. Der Dienst bindet nur an Loopback. Lokale Beschränkungen ersetzen keine Dienstauthentifizierung; nicht extern zugänglich machen. Browser werden später über Host/Plugin oder einen authentifizierten Proxy kommunizieren.

`GET /v1/capabilities` unterscheidet bekannte Vertragsunterstützung (`contractSupported: true`) von Betriebsverfügbarkeit (`available: false` mit Grund). Fabric, Inbetriebnahme, Inventar, Befehle, Abonnements, Thread und OTA starten als nicht verfügbar. Fähigkeiten ersetzen niemals die Release-Kompatibilität.

Die Routenregistrierung definiert Fabric-Metadaten/-Lebenszyklus, Inbetriebnahme Start/Status/Abbruch, maßgebliche Inventar-Snapshots, typisierte Befehle, Abonnement Erstellen/Status/Abbruch und Berichte, Thread-Status/Dataset-Operationen sowie genehmigte OTA-Anfragen/Fortschritt. Die vollständige Referenz entsteht mit `pnpm nx run matter-contract:export-contract`. OpenAPI 3.1 und JSON Schema liegen im ignorierten `dist/contracts/matter/`; generierte Schemas/Clients werden nicht eingecheckt. `matter-contract:validate-artifacts` prüft Referenzen und Beispiele gegen die exportierten Schemas.

Fehler enthalten `schemaVersion: 1`, Code, sichere Nachricht, Anfrage-/Operationszuordnung, Wiederholbarkeit und typisierte sichere Details. HTTP-Zuordnung: Validierung `400`, Formatversion `426`, Release-Kombination `409`, Dienst nicht verfügbar `503`, Fähigkeit nicht verfügbar `501`, Zeitüberschreitung `504`, Abgleich erforderlich `409`, Browser-Origin `403`, unbekannte Route `404`, Größenlimit `413`, interner Fehler `500`. Ein unbekanntes `/vN` fällt niemals auf `/v1` zurück.

WebSocket-Fehler auf Anwendungsebene verwenden `ErrorEnvelope`, sofern die Ausgangswarteschlange Platz hat. Zu große Nachrichten lehnt der WebSocket-Parser vor der Anwendungsvalidierung ab. Das gilt auch, wenn einzelne Fragmente innerhalb der Grenze liegen, die gesamte Nachricht sie aber überschreitet. Dieser Transportfehler sendet nur den Schließcode `1009` mit leerem Grund, ohne JSON-Hülle oder zurückgespiegelte Anfragewerte. Wenn der Parser den Fehler meldet, hat das Schließen bereits begonnen; Anwendungsdaten können dann nicht mehr gesendet werden. Die Parsergrenze bleibt aktiviert. Eine Nachricht genau an der Grenze erreicht weiterhin die Anwendungsvalidierung. Nach einem `1009`-Schließen die Nachricht vor dem erneuten Verbinden verkleinern.

## Ereignisse, Wiederaufnahme und Abgleich

Jedes Anwendungsereignis hat eine stabile UUID `eventId`, `schemaVersion: 1`, UTC-Zeitstempel, typisiertes Ereignis/Payload, nullable auslösende Anfrage-/Operations-IDs, UUID `streamInstanceId` und steigende sichere Ganzzahlsequenz. Autonome Ereignisse enthalten ausdrücklich null-Zuordnung. Ping/Pong sind Transportframes, keine Anwendungsereignisse. Erste Lebenszyklus- und Fähigkeitsereignisse verwenden denselben Umschlag.

Nach dem Upgrade innerhalb von 10 Sekunden eine `ClientMessage` senden:

```json
{ "schemaVersion": 1, "type": "resume", "requestId": "00000000-0000-4000-8000-000000000001", "cursor": null }
```

Ein null-Cursor startet frisch am aktuellen Sequenzstand und trifft keine Aussage zum Gerätezustand. Ein gespeicherter Cursor ist `{ "streamInstanceId": "UUID", "sequence": 42 }` und bezeichnet die zuletzt verarbeitete Sequenz. Nachfolgende gespeicherte Ereignisse werden geordnet wiederholt, dann folgt `stream.ready` mit Sequenzstand, anschließend Live-Ereignisse. Wiederholung und Live-Abonnement werden atomar verbunden. Wiederholte IDs, Zeitstempel, Sequenzen und Zuordnungen bleiben unverändert. Nur eine Wiederaufnahme-Nachricht pro Verbindung senden; für eine weitere erneut verbinden. Jede Nachricht wird validiert, einschließlich Version nach Abonnementbeginn.

Der Arbeitsspeicherpuffer hält höchstens 1.000 Ereignisse für fünf Minuten. Zustellung nach Wiederverbindung erfolgt mindestens einmal: Empfänger müssen Duplikate anhand der Ereignis-ID unterdrücken. Ordnung gilt innerhalb einer Stream-Instanz, niemals über Neustarts hinweg. Ungültige, abgelaufene, verdrängte, zukünftige oder fremde Cursor liefern `RECONCILIATION_REQUIRED` und schließen mit Code `4009`. Auch Warteschlangenüberlauf schließt mit `4009`; bei voller Verbindung kann nur der verständliche Schließgrund ankommen. Standardlimit der Ausgangswarteschlange: 1 MiB.

Eine maßgebliche Wiederherstellung ist in diesem Fundament nicht verfügbar; der Fehler meldet `snapshotAvailable: false`. Den Verbraucherzustand als nicht abgeglichen beibehalten. Niemals still zum neuesten Ereignis springen oder physische Befehle wiederholen. Eine künftige Snapshot-Funktion wird den Abgleich ermöglichen: maßgeblichen Inventar-Snapshot mit Stream-Sequenzstand abrufen, danach hinter diesem Stand wiederaufnehmen. Heute existiert nur das Snapshot-Schema. Jeder neue Prozess hat eine neue Stream-ID.

## Physische Sicherheit und sensible Daten

Angefragt, angenommen, abgeschlossen, fehlgeschlagen und ungewiss bleiben getrennte Ergebnisse. Angenommen bedeutet nicht, dass das Gerät Erfolg gemeldet hat. Eine Zeitüberschreitung oder verlorene Verbindung kann den Befehlsausgang ungewiss lassen; mehrdeutige physische Befehle niemals automatisch wiederholen.

Ein generisches Matter-`On` ist keine Berechtigung zum Betrieb einer Maschine. Maschinenverriegelungen und Attraccess-Sicherheitsprüfungen bleiben maßgeblich. Direkte Befehle zum Entriegeln/Entsperren oder Einschalten erfordern vor der Ausführung eine eigene Berechtigung und eine ausdrückliche Bestätigung.

Extern beobachtete Geräteänderungen dürfen keinem erfundenen Attraccess-Akteur zugeordnet werden. Ihr externer Ursprung und die null-Zuordnung bleiben erhalten; sie werden nicht dem letzten Benutzer zugeschrieben, der einen Befehl gesendet hat. Nicht zugeordnete Geräte und getrennte Fabric-Mitgliedschaften bleiben als Abweichungen für einen ausdrücklichen Abgleich sichtbar; sie dürfen weder stillschweigend zu verwalteten Geräten werden noch aus den Aufzeichnungen gelöscht werden.

Diese Vorgaben gelten für die späteren Geräte-, Berechtigungs-/Audit- und Befehls-Tickets. Berechtigungsdurchsetzung, Registry-Abgleich und physisches Geräteverhalten werden in diesem Fundament noch nicht implementiert.

Setup-Codes, WLAN-Zugangsdaten und Thread-Datasets sind ausschließlich Anfragedaten. Normale Statuswerte, Ereignisse, Diagnose und Logs enthalten keine Inbetriebnahme-/Fabric-Geheimnisse oder Dataset-Bytes. Validierungsfehler geben weder Anfragekörper noch ungültige Werte aus. Geräteadapter dürfen nur definierte öffentliche Berichtswerte senden und keine Geheimnisse in Namen oder Textberichten verstecken.

## Nächste Schritte

- [ATT-1001](https://linear.app/attraccess/issue/ATT-1001): authentifizierter Plugin-Client, TLS/Proxy, Wiederverbindung, Abbruch und Duplikatunterdrückung.
- [ATT-1000](https://linear.app/attraccess/issue/ATT-1000): Produktionsimages/-Manifeste, Speicher/Geheimnisse und Integration in `pnpm serve`.
- [ATT-998](https://linear.app/attraccess/issue/ATT-998): Fabric-Persistenz, verschlüsselte Sicherung/Wiederherstellung und Wiederanlauf.
- Spätere Tickets: Inbetriebnahme/Gerätefunktionen, Thread/OTBR, OTA, Berechtigungen/Audit, Flows und Verwaltungsoberfläche.

[Betriebsanleitung](devices/matter-operations.md)
