# Knotentypen

Diese Referenz beschreibt alle eingebauten Flow-Knoten. Der Editor gruppiert sie nach Zweck, etwa Abrechnung, Nachrichten und Flow-Steuerung, und zeigt die vom Ressourcentyp unterstützten Knoten. Nutzungs-, Aktivitäts- und Abrechnungsknoten sind für **Maschinen**; Tür-Trigger für **Türen**. Plugins können weitere Knoten mit eigenen Einstellungen ergänzen.

Lesen Sie zuerst [Payloads, Variablen & Vorlagen](flows/payloads-variables-templates.md) für Pfade, Datentypen und Beispiele. **Vorlage** bezeichnet hier eine Handlebars-Vorlage, die den aktuellen Eingang verwendet. Andere Einstellungen sind wörtliche Werte, sofern nicht anders beschrieben. Objekt-Payloads erhalten Ressourcenkontext; Vorlagen können gespeicherte Variablen lesen.

Felder mit Vorlagenunterstützung bieten auch `add`, `subtract`, `multiply` und `divide`. Syntax und Beispiele finden Sie unter [Arithmetik und Einheitenumrechnung](flows/payloads-variables-templates.md#arithmetik-und-einheitenumrechnung).

## Eingabe-Knoten (Trigger)

Trigger starten einen Durchlauf und geben ihre Ereignisdaten über **Ausgang** weiter.

### Button

Typ: `input.button` · Maschinen · Editor: **Taste**

Ergänzt einen manuellen Button auf der Ressourcen-Detailseite. **Beschriftung** ist erforderlicher, wörtlicher Text. Die Payload beginnt mit Ressourcenkontext; sie enthält nicht den Benutzer, der den Button gedrückt hat. Der Button kann nur vom Besitzer einer aktiven Nutzungssitzung gedrückt werden.

Beispiel: Button `Relais testen` mit **MQTT-Nachricht senden** verbinden.

### Nutzung gestartet

Typ: `input.resource.usage.started` · Maschinen

Läuft während eines Nutzungsstarts. Keine Einstellungen. Die Payload enthält Felder der neuen Sitzung an der Wurzel (`id`, `startTime`, `user`, `formSubmissions` usw.). `{{user.username}}` liest den Sitzungsbesitzer. Ein Flow-Fehler kann den Start verhindern; wählen Sie das Fehlerverhalten externer Aktionen entsprechend.

### Nutzung beendet

Typ: `input.resource.usage.stopped` · Maschinen

Läuft während eines Nutzungsendes. Keine Einstellungen. Die Payload enthält die bisherige Sitzung, eingereichte Formulare und Endfelder wie `endTime`, `endNotes`. Beispiel: Relais ausschalten oder vor der Abrechnung einen Posten ergänzen.

### Nutzung übernommen

Typ: `input.resource.usage.takeover` · Maschinen

Läuft bei Übernahme einer aktiven Sitzung. Keine Einstellungen. Die Payload enthält die bisherige Sitzung sowie `newUser`, `oldUser`, `takeOverTime`. `{{newUser.username}}` liest den neuen Besitzer. Eine Übernahme verwendet diesen Trigger anstelle von **Nutzung gestartet**.

### Tür entriegelt

Typ: `input.resource.door.unlocked` · Türen

Läuft bei einer Entriegelungsaktion. Keine Einstellungen. Die Payload enthält `event.timestamp`, `usage.start`, `usage.end`, `user.id`, `user.username`, `user.externalIdentifier`. Beispiel: Entriegelungsbefehl mit **MQTT-Nachricht senden** versenden.

### Tür verriegelt

Typ: `input.resource.door.locked` · Türen

Läuft bei einer Verriegelungsaktion. Keine Einstellungen. Verwendet dieselbe Payload-Struktur wie **Tür entriegelt**. Beispiel: Verriegelungsbefehl an den Türcontroller senden.

### Tür-Falle geöffnet

Typ: `input.resource.door.unlatched` · Türen

Läuft beim kurzen Öffnen der Türfalle. Keine Einstellungen. Verwendet dieselbe Payload-Struktur wie **Tür entriegelt**. Beispiel: Impuls an einen elektrischen Türöffner senden.

### MQTT-Nachricht empfangen

Typ: `input.mqtt.message.received`

| Einstellung             | Beschreibung                                                                      |
| ----------------------- | --------------------------------------------------------------------------------- |
| **Server** (`serverId`) | Konfigurierter MQTT-Server                                                        |
| **Topic**               | Fester Topic-Filter; `+` für eine Ebene und abschließendes `#` für mehrere Ebenen |

Die Payload ist `{ serverId, topic, payload }`. MQTT-Inhalt wird nach Möglichkeit als JSON gelesen, sonst als Text. Eine Nachricht `{"running":true}` wird mit `{{payload.running}}` gelesen, im **Wenn**-Knoten mit dem Pfad `payload.running`. Topic-Filter sind keine Vorlagen.

### Keine Aktivität

Typ: `input.resource.activity.no-activity` · Maschinen · Editor: **Inaktivitäts-Timeout erreicht**

**Minimale Inaktivität (Minuten)** (`minInactivityMinutes`) ist eine positive ganze Zahl. Läuft nur bei einer aktiven, finalisierten Nutzungssitzung. Die Prüfung erfolgt einmal pro Minute und ist kein präziser Timer. Die Payload beginnt nur mit Ressourcenkontext.

**Aktivität verfolgen** setzt den Timer zurück. Nach dem Auslösen wird er ebenfalls zurückgesetzt und kann bei weiterhin aktiver Sitzung erneut auslösen. Aktivitätszeiten liegen im Arbeitsspeicher und werden nach Serverneustart neu initialisiert. Beispiel: mit **Nutzungssitzung beenden** für automatische Abschaltung verbinden.

### Variable geändert

Typ: `input.variable.changed`

| Einstellung                          | Beschreibung                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| **Überwachte Variablen** (`watches`) | Mindestens ein festes Paar aus Schlüssel und Geltungsbereich (`resource` oder `global`) |
| **Trigger-Quelle** (`source`)        | `any` (Standard) oder `exclude-self`, das Änderungen aus dieser Ressource überspringt   |

Die Payload enthält `change: { scope, key, previousValue, newValue, changedAt, sourceResourceId }` und einen Schnappschuss überwachter Variablen unter `variables.resource` / `variables.global`. Anlegen zählt als Änderung; identische Schreibvorgänge und Löschen lösen nicht aus. Ressourcenvariablen gelten für diese Ressource; globale können ressourcenübergreifend auslösen.

Beispiel: globale Variable `workshopOpen` überwachen, mit **Variablen lesen** kopieren und mit **Wenn** verzweigen. Siehe [dauerhaft gespeicherte Variablen](flows/payloads-variables-templates.md#dauerhaft-gespeicherte-flow-variablen) für Vorlagenzugriff und das Vermeiden von Schleifen.

### Companion: Gerät inaktiv

Typ: `input.companion.idle`

Wählen Sie ein **Companion-Gerät** (`deviceId`). Läuft, wenn es Inaktivität meldet; die Inaktivitätsschwelle gehört zur Companion-Konfiguration. Payload-Felder an der Wurzel: `idleSeconds` und optional `platform`. Beispiel: `idleSeconds` mit **Wenn** vergleichen.

### Companion: Gerät aktiv

Typ: `input.companion.active`

Wählen Sie ein **Companion-Gerät**. Läuft bei Rückkehr aus der Inaktivität. Payload-Felder an der Wurzel: `idleSeconds` und optional `platform`. Beispiel: Aktivität für die Ressource aufzeichnen.

### Companion: Vordergrund-App geändert

Typ: `input.companion.foreground_app_changed`

Wählen Sie ein **Companion-Gerät**. Läuft, wenn dessen fokussierte Anwendung wechselt. Payload-Felder an der Wurzel: `appName`, `pid`, optional unter macOS `bundleId`. Beispiel: Pfad `appName` mit einem Anwendungsnamen vergleichen.

### Companion: USB-Gerät verbunden

Typ: `input.companion.usb_device_connected`

| Einstellung                      | Beschreibung                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------ |
| **Companion-Gerät** (`deviceId`) | Zu überwachendes Gerät                                                         |
| **Hersteller-ID / Produkt-ID**   | Optionale ganzzahlige Filter in Dezimaldarstellung; leer akzeptiert jeden Wert |

Payload-Felder an der Wurzel: `vendorId`, `productId`, optional `manufacturer`, `product`, `serialNumber`. Sind beide Filter gesetzt, müssen beide passen. Beispiel: auf ein bestimmtes USB-Zubehör reagieren.

### Companion: USB-Gerät getrennt

Typ: `input.companion.usb_device_disconnected`

Wählen Sie ein **Companion-Gerät** und optionale dezimale **Hersteller-ID / Produkt-ID** wie bei USB-Gerät verbunden. Läuft beim Entfernen mit denselben Payload-Feldern; optionale Beschreibungsfelder können fehlen.

### Messung starten

Typ: `input.resource.metering.start` · Maschinen · Abrechnung

Bereitet den Zähler vor, bevor eine abgerechnete Sitzung startet oder übernommen wird. **Zeitlimit (Sekunden)**: 1–600, Standard **30**. Der Zweig muss **Messung bereit** erreichen, sonst startet die Sitzung nicht.

Die Payload enthält `metering: { sessionId, operationId, resourceId, usageId, kind, requestedAt }` mit `kind: "start"`. Beispiel: Lifetime-Zähler per HTTP lesen und dessen Baseline melden. Siehe [Energiemessung](flows/energy-metering.md).

### Messwert abfragen

Typ: `input.resource.metering.collect` · Maschinen · Abrechnung

| Einstellung                                     | Bereich / Standard                            |
| ----------------------------------------------- | --------------------------------------------- |
| **Zeitlimit (Sekunden)**                        | 1–600 / **30**                                |
| **Zwischenintervall (Minuten)**                 | 0–1440 / **1**; `0` deaktiviert Zwischenwerte |
| **Versuche für den Endwert**                    | 1–10 / **3**                                  |
| **Pause zwischen Endwert-Versuchen (Sekunden)** | 0–120 / **5**                                 |

Läuft für laufende Zwischenwerte und Endwerte beim Sitzungsende. Die Payload enthält dieselben Messfelder wie **Messung starten**, mit `kind: "interim"` oder `"final"`. Der Zweig muss **Energie melden** erreichen. Zwischenwerte werden nie abgerechnet. Siehe [Energiemessung](flows/energy-metering.md) für Aktualität und ausstehende Gebühren.

## Verarbeitungs-Knoten

### Warten

Typ: `processing.wait`

**Dauer** ist eine positive ganze Zahl; **Einheit** ist `seconds`, `minutes` oder `hours`. Pausiert diesen Zweig und gibt die unveränderte Payload über **Ausgang** weiter. Die Einstellungen sind feste Werte, keine Vorlagen.

### Wenn (If)

Typ: `processing.if`

| Einstellung                             | Beschreibung                                                   |
| --------------------------------------- | -------------------------------------------------------------- |
| **Payload-Pfad** (`path`)               | Fester Pfad im Eingang, etwa `payload.temperature`             |
| **Operator** (`comparisonOperator`)     | `=`, `!=`, `>`, `<`, `>=`, `<=`                                |
| **Vergleichswert**                      | Wörtlicher Text oder ein zweiter Pfad bei aktiviertem Schalter |
| **Vergleichswert ist ein Payload-Pfad** | Standard **aus**                                               |

Gibt die unveränderte Payload über **Wahr** (`output-true`) oder **Falsch** (`output-false`) weiter. Gleichheit vergleicht Zeichenketten; geordnete Vergleiche wandeln beide Werte in Zahlen um. Fehlende Pfade ergeben leeren Text; ungültige Zahleneingaben werden `NaN`, geordnete Vergleiche damit falsch. Diese Felder rendern keine Vorlagen.

Beispiel: Pfad `payload.temperature`, Operator `>`, fester Vergleichswert `40`. Gespeicherte Variablen vor dem Vergleich mit **Variablen lesen** in die Payload kopieren.

### Payload setzen

Typ: `processing.set-payload`

Konfigurieren Sie **Einträge**, jeweils mit festem **Schlüssel (Pfad)** und **Wertvorlage**. Erhält vorhandene Felder und schreibt gerenderte **Zeichenketten** an die Pfade, dann Weitergabe über **Ausgang**.

Beispiel: Schlüssel `reading.temperature`, Wert `{{payload.temperature}}`. Alle Einträge lesen die Eingangs-Payload; abhängige Zuweisungen benötigen getrennte Knoten. Dieser Knoten speichert keine dauerhaften Variablen und liest Werte nicht als JSON. Siehe [Die Payload ändern](flows/payloads-variables-templates.md#die-payload-ändern).

### Variablen setzen

Typ: `processing.variables.set`

Konfigurieren Sie mindestens eine **Variable** mit **Schlüsselvorlage**, **Wertvorlage** und festem **Geltungsbereich** (`resource` oder `global`). Liest gültige gerenderte Werte als JSON, sonst speichert er Text. Die weitergegebene Payload bleibt unverändert; gespeicherte Werte sind für Vorlagen nachfolgender Knoten verfügbar.

Beispiel: Ressourcenschlüssel `lastReading`, Wert `{{json payload}}` speichert den MQTT-Inhalt mit erhaltenem Typ. Änderungen können **Variable geändert** auslösen. Abhängige Schreibvorgänge auf mehrere Knoten verteilen. Siehe [Werte mit ihrem Typ speichern](flows/payloads-variables-templates.md#werte-mit-ihrem-typ-speichern).

### Variablen lesen

Typ: `processing.variables.get`

Konfigurieren Sie mindestens eine **Variable** mit **Schlüsselvorlage**, festem **Geltungsbereich** und festem **Payload-Pfad**. Kopiert den gespeicherten Wert mit seinem ursprünglichen Typ an den Pfad. Erhält andere Felder und gibt über **Ausgang** weiter.

Beispiel: Ressourcenschlüssel `targetTemperature` → `limits.temperature`. Eine fehlende Variable ergibt ein undefiniertes Feld und eine Serverwarnung; sie stoppt den Flow nicht.

### Auf MQTT-Nachricht warten

Typ: `processing.mqtt.waitForMessage`

| Einstellung             | Beschreibung                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Server** (`serverId`) | Konfigurierter MQTT-Server                                                           |
| **Topic**               | Fester Filter mit `+` und abschließendem `#`; keine Vorlage                          |
| **Timeout (Sekunden)**  | Positive ganze Zahl                                                                  |
| **Subscribe-QoS**       | Optional `0`, `1`, `2`; effektives QoS ist das niedrigere von Publish-/Subscribe-QoS |
| **Bei Fehler**          | Siehe [Fehlerverhalten](flows/node-types.md#fehlerverhalten)                         |

Wartet nach dem Abonnieren auf die nächste passende Nachricht. Bei Erfolg erhält **Ausgang** `{ topic, payload }` und ersetzt die bisherigen Daten. MQTT-Inhalt wird nach Möglichkeit als JSON gelesen. Timeout oder Abonnementfehler folgen **Bei Fehler**; für einen Timeout-Zweig **Fehler** verbinden und `failure-output` wählen. Beispiel: vor der Energiemeldung auf die Geräteantwort warten.

### Fehler

Typ: `processing.error`

**Fehlermeldungsvorlage** ist erforderlich. Rendert die Nachricht und löst einen Flow-Fehler aus. Kein Ausgang. Beispiel: `Zähler für {{resource.name}} nicht verfügbar` an einem **Wenn → Falsch**-Zweig.

## Ausgabe-Knoten (Aktionen)

Aktionen mit **Ausgang** können nachfolgende Knoten ausführen. Abrechnungsposten, Aktivitätsaufzeichnung und Messabschluss haben im Core-Katalog keinen ausgehenden Anschluss.

### Fehlerverhalten

**HTTP-Anfrage**, **MQTT-Nachricht senden**, **Auf MQTT-Nachricht warten** und **Nutzungssitzung beenden** bieten **Bei Fehler** (`failureBehavior`):

| Auswahl                                                          | Ergebnis                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Flow abbrechen** (`fail-flow`)                                 | Löst einen Fehler aus und stoppt diesen Pfad; kann die auslösende Nutzungsaktion abbrechen |
| **Über Fehlerausgang fortfahren** (`failure-output`)             | Gibt den ursprünglichen Eingang plus `flowError: { kind, message }` über **Fehler** weiter |
| **Protokollieren und fortfahren** (`log-and-continue`, Standard) | Protokolliert den Fehler und gibt den ursprünglichen Eingang über **Ausgang** weiter       |

`flowError.kind` ist `transport-dispatch`, `acknowledgement-timeout`, `controller-rejection` oder `node-failure`. `{{flowError.message}}` liest die Meldung im Fehlerzweig. Ein angeschlossener Fehlerausgang allein aktiviert die Weiterleitung nicht.

HTTP- und MQTT-Senden bieten außerdem **Abschlussverhalten**: **Bestätigt** (`acknowledged`, Standard) wartet auf Antwort/Publish-Callback; **Nur senden** (`dispatch`) fährt nach dem Anstoßen fort. Eine MQTT-Publish-Bestätigung bestätigt den Transport, nicht die Befehlsausführung im Gerät. Fehler nach dem Fortfahren einer HTTP-Dispatch-Anfrage können nur protokolliert werden, nicht den Flow abbrechen oder einen Fehlerzweig auslösen.

### HTTP-Anfrage

Typ: `output.http.sendRequest` · Editor: **HTTP-Anfrage senden**

| Einstellung                               | Beschreibung                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| **Methode**                               | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`              |
| **URL**                                   | Erforderliche URL; Vorlagenunterstützung                                |
| **Headers**                               | Feste Namen, Werte als Vorlagen                                         |
| **Body**                                  | Optionale Textvorlage; für JSON `Content-Type: application/json` setzen |
| **Timeout (Sekunden)** (`timeoutSeconds`) | Optionale positive ganze Zahl; begrenzt die HTTP-Anfrage                |
| **Abschlussverhalten**                    | `acknowledged` oder `dispatch`                                          |
| **Bei Fehler**                            | Gemeinsames Fehlerverhalten oben                                        |

Bestätigter Erfolg ersetzt die Payload durch den Antwort-Body. JSON `{"energy_wh":1500}` ist als `{{energy_wh}}` verfügbar, ohne `response`-Präfix. Dispatch gibt den Eingang ohne Antwort weiter; sein Standard-Anfragetimeout ist 30 Sekunden. Bestätigte Anfragen haben ohne konfigurierte Grenze keinen Knoten-Timeout.

Beispiel-Body: `{"resource": {{json resource.name}}, "reading": {{json payload}} }`. Benötigte frühere Ereignisfelder vor einer bestätigten Anfrage in Variablen speichern.

### MQTT-Nachricht senden

Typ: `output.mqtt.sendMessage`

| Einstellung                         | Beschreibung                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| **Server** (`serverId`)             | Konfigurierter MQTT-Server                                                       |
| **Topic**                           | Erforderliche Vorlage, etwa `workshop/{{resource.id}}/command`                   |
| **Payload**                         | Optionale Nachrichtenvorlage                                                     |
| **QoS**                             | Optional `0`, `1`, `2`; leer verwendet den Serverstandard                        |
| **Retain**                          | Optional; leer verwendet den Serverstandard                                      |
| **Abschlussverhalten**              | `acknowledged` oder `dispatch`                                                   |
| **Bestätigungs-Timeout (Sekunden)** | Optionale positive ganze Zahl; ohne Wert kein Knoten-Timeout für die Bestätigung |
| **Bei Fehler**                      | Gemeinsames Fehlerverhalten oben                                                 |

Gibt bei Erfolg die unveränderte Payload über **Ausgang** weiter. Beispiel: `{{json payload}}` sendet empfangenen MQTT-Inhalt als JSON weiter. Server, QoS, Retain und Zeiteinstellungen sind feste Werte.

### Abrechnungsposten setzen

Typ: `output.resource.billing.calculation.set-additional-items` · Maschinen · Editor: **Abrechnungs Position hinzufügen**

Jeder Knoten ergänzt **einen Posten**, keine Liste.

| Einstellung                   | Beschreibung                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| **Name**                      | Erforderlicher wörtlicher Text                                   |
| **Einzelpreis** (`unitPrice`) | Ganzzahliger Abrechnungsbetrag; der Editor zeigt ihn als Währung |
| **Menge**                     | Positive ganze Zahl; das Wurzelfeld `quantity` überschreibt sie  |
| **Beschreibung**              | Optionaler wörtlicher Text                                       |
| **Externe Referenz**          | Optional; Sonderregel unten beachten                             |

Verwendet die Nutzungs-ID im Wurzelfeld `id`, falls vorhanden, sonst die aktive Sitzung dieser Ressource. Benötigt eine ausstehende Abrechnung oder eine Nutzungs-Lebenszyklusaktion; ohne passende Sitzung/Transaktion schlägt er fehl. Bei passenden vorhandenen Posten werden Mengen addiert. Die Ausgabedaten sind das Postenobjekt und ersetzen die ursprüngliche Payload; der Katalog bietet keinen ausgehenden Anschluss.

Die externe Referenz verwendet ein Wurzelfeld `externalReference` vom Typ Text als Override, falls vorhanden. Ist dieses Feld vorhanden **und** eine nicht leere Referenz am Knoten konfiguriert, wird stattdessen die konfigurierte Referenz als Vorlage gerendert. Ohne das Payload-Feld bleibt die konfigurierte Referenz wörtlich. Name, Beschreibung und Einzelpreis rendern keine Vorlagen.

Beispiel: Formularantwort mit **Payload setzen** nach `quantity` übertragen, dann bei **Nutzung beendet** einen Verbrauchsmaterialposten ergänzen.

### Nutzungssitzung beenden

Typ: `output.resource.usage.end-session` · Maschinen · Editor: **Aktive Sitzung beenden**

**Notizen** ist eine optionale Vorlage. **Bei Fehler** folgt dem gemeinsamen Verhalten. Beendet die aktuelle Sitzung dieser Ressource mit deren Besitzer; eine fehlende aktive Sitzung führt zum Fehler. Gibt bei Erfolg die unveränderte Payload weiter. Während eines ausstehenden Starts/einer Übernahme kann er die Kandidatensitzung dieser Lebenszyklusaktion beenden.

Beispielnotiz: `Wegen Inaktivität an {{resource.name}} automatisch beendet`. Die Aktion überspringt erforderliche Endformulare und Notizbenachrichtigungen.

### Aktivität verfolgen

Typ: `output.resource.activity.track-activity` · Maschinen · Editor: **Aktivität aufzeichnen**

Keine Einstellungen. Zeichnet Aktivität zum Serverzeitpunkt auf und setzt den **Keine Aktivität**-Timer zurück. Die Payload bleibt unverändert; der Katalog bietet keinen ausgehenden Anschluss. Beispiel: MQTT-Trigger mit beobachteter Aktivität hier verbinden. Dies weist keinen Maschinenbetriebszustand zu.

### Maschinenbetriebszustand

Verwenden Sie ein beobachtetes Signal, das Ihr Flow auswertet. Ein gesendeter Befehl oder der Start einer Nutzungssitzung beweist allein keinen physischen Maschinenbetrieb.

Wiederholte Zuweisungen desselben Zustands ändern nichts. Ein Betriebsintervall bleibt über Sitzungsgrenzen und Neustarts hinweg offen, bis ein Flow den Ruhezustand zuweist. Änderungen speichern Serverzeit sowie Flow-Knoten/-Durchlauf. Eine Serverzeit vor der letzten akzeptierten Änderung führt zum Fehler.

Akzeptierte Beobachtungen bleiben gespeichert, auch wenn ein späterer Knoten fehlschlägt. Ein fehlgeschlagener Nutzungsstart/eine Übernahme bricht Sitzungs- und Abrechnungsänderungen weiterhin ab. Bei Serverstopp ausstehende Nutzungsänderungen werden beim Neustart verworfen; physische Befehle werden nicht erneut ausgeführt.

### Betriebsbeginn aufzeichnen

Typ: `output.resource.activity.operating` · Maschinen

Keine Einstellungen. Weist **Betrieb** zu und startet bei zuvor ruhender Maschine ein Intervall zum Serverzeitpunkt. Gibt die unveränderte Payload über **Ausgang** weiter. Beispiel: **Wenn → Wahr** nach Auswertung des tatsächlichen Betriebssignals verbinden.

### Betriebsende aufzeichnen

Typ: `output.resource.activity.idle` · Maschinen

Keine Einstellungen. Weist **Ruhezustand** zu und schließt ein offenes Betriebsintervall zum Serverzeitpunkt. Gibt die unveränderte Payload über **Ausgang** weiter. Beispiel: **Wenn → Falsch** für dasselbe beobachtete Betriebssignal verbinden.

### Gesundheits-Lebenszeichen senden

Typ: `output.resource.health.heartbeat`

| Einstellung                               | Beschreibung                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| **Kennung**                               | Optionale feste Teilsystembezeichnung; leer verwendet den Ressourcenstandard |
| **Timeout (Sekunden)**                    | Positive ganze Zahl                                                          |
| **Grund bei Timeout** (`unhealthyReason`) | Optionaler wörtlicher Text; Standard `Heartbeat timed out`                   |

Markiert das Teilsystem als gesund und speichert den letzten Empfangszeitpunkt. Eine Prüfung pro Minute markiert es nach dem Timeout als ungesund. Timerdaten liegen im Arbeitsspeicher und werden nach Neustart neu initialisiert. Gibt die unveränderte Payload über **Ausgang** weiter. Keine Einstellung rendert Vorlagen. Beispiel: periodische MQTT-Statusnachricht hier verbinden.

### Gesundheitszustand setzen

Typ: `output.resource.health.set`

| Einstellung | Beschreibung                                                            |
| ----------- | ----------------------------------------------------------------------- |
| **Kennung** | Optionale Vorlage; Pfad `health.identifier` kann sie überschreiben      |
| **Status**  | Fest `healthy` oder `unhealthy`; `health.status` kann ihn überschreiben |
| **Grund**   | Optionale Vorlage; `health.reason` kann ihn überschreiben               |

Overrides müssen nicht leere Zeichenketten sein; ungültiger Status führt zum Fehler. Bei gesunden Meldungen wird der Grund gelöscht. Gibt die unveränderte Payload über **Ausgang** weiter. Beispiel: **Payload setzen** mit Schlüssel `health.status`, Wert `unhealthy`, und Schlüssel `health.reason`, Wert `Gerät meldet {{payload.error}}`, dann hier verbinden.

### PC sperren

Typ: `output.companion.lock-pc`

Wählen Sie ein festes **Companion-Gerät** (`deviceId`). Sendet einen Bildschirmsperrbefehl. Gibt Eingangsfelder über **Ausgang** weiter und ersetzt ein vorhandenes `companion`-Feld durch `{ delivered }`. `companion.delivered` zeigt, ob der Befehl an ein verbundenes Gerät gesendet wurde, nicht ob das Betriebssystem die Sperre abgeschlossen hat. Ein Offline-Gerät ergibt `false`. Der gewünschte Sperrzustand wird auch für die nächste Authentifizierung gespeichert.

### PC entsperren

Typ: `output.companion.unlock-pc`

Wählen Sie ein festes **Companion-Gerät**. Sendet einen Entsperrbefehl und speichert den gewünschten Zustand. Payload-Verhalten wie bei **PC sperren**: `companion.delivered` zeigt die Zustellung. Die tatsächliche Entsperrung hängt von der Companion-Plattformintegration ab.

### Messung bereit

Typ: `output.resource.metering.ready` · Maschinen · Abrechnung

| Einstellung                          | Beschreibung                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Baseline-Wert / Baseline-Einheit** | Optionale Vorlagen für den aktuellen Gesamtstand eines Lifetime-Zählers und dessen Energieeinheit |
| **Quelle**                           | Optionale Vorlage mit dem Namen des physischen Zählers                                            |

Schließt eine **Messung starten**-Operation ab. Schlägt außerhalb eines Startzweigs fehl. Bei zurücksetzbaren Zählern Baseline leer lassen; eine konfigurierte Baseline, die leer gerendert wird, führt zum Fehler. Der Katalog bietet keinen ausgehenden Anschluss.

Beispiel nach HTTP-Antwort `{"energy_wh":1500}`: Baseline `{{energy_wh}}`, Einheit `Wh`. Siehe [Energiemessung](flows/energy-metering.md).

### Energie melden

Typ: `output.resource.metering.report` · Maschinen · Abrechnung

| Einstellung     | Beschreibung                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Wert**        | Erforderliche Vorlage für Gesamtenergie seit Messstart oder aktuellen Lifetime-Gesamtstand bei Baseline-Nutzung    |
| **Einheit**     | Erforderliche Vorlage: `Wh`, `kWh`, `MWh`, `mWh`, `J`, `kJ`, `MJ` oder unterstützte ausgeschriebene Energieeinheit |
| **Gemessen am** | Optionale ISO-Zeitstempelvorlage; Standard ist der Meldezeitpunkt                                                  |
| **Quelle**      | Optionale Vorlage mit dem Zählernamen                                                                              |

Schließt eine **Messwert abfragen**-Operation ab; schlägt außerhalb eines Abfragezweigs fehl. Meldet Energie, nicht Leistung oder einen Zuwachs. Leistungseinheiten (`W`, `kW` usw.) werden abgelehnt. Eine konfigurierte Zeitvorlage, die leer gerendert wird, führt zum Fehler; Endwerte müssen aktuell sein. Der Katalog bietet keinen ausgehenden Anschluss.

Beispiel nach **Auf MQTT-Nachricht warten** mit Inhalt `{"energy_wh":1500}`: Wert `{{payload.energy_wh}}`, Einheit `Wh`. Siehe [Energiemessung](flows/energy-metering.md) für Baselines, Einheiten und Wiederholungsversuche.

## Siehe auch

- [Payloads, Variablen & Vorlagen](flows/payloads-variables-templates.md) — Datenpfade und vollständige Beispiele
- [Flow-Editor](flows/flow-editor.md) — Knoten hinzufügen und verbinden
- [MQTT & IoT](mqtt/overview.md) — MQTT-Server konfigurieren
- [Energiemessung](flows/energy-metering.md) — Strom pro kWh abrechnen
- [Abrechnung](billing/overview.md) — Details zum Abrechnungssystem
