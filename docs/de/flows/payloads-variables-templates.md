# Payloads, Variablen & Vorlagen

Jeder Flow-Knoten erhält Daten vom vorherigen Knoten und gibt Daten an den nächsten weiter. Diese Daten heißen **Payload**. Vorlagen lesen die Payload, um Nachrichten, URLs oder andere Einstellungen zu erzeugen. **Flow-Variablen** speichern Werte, die einen Flow-Durchlauf überdauern sollen.

## Drei Arten von Daten

| Daten                   | Lebensdauer                                                       | Verwendung                                                                           |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Knoteneinstellungen** | Mit dem Flow gespeichert                                          | Einen Knoten konfigurieren, etwa MQTT-Server oder Wartezeit                          |
| **Payload**             | Wird im aktuellen Zweig weitergegeben                             | Einen Pfad wie `payload.temperature` lesen; mit **Payload setzen** ändern            |
| **Flow-Variablen**      | In der Datenbank über Durchläufe und Neustarts hinweg gespeichert | Mit **Variablen setzen** schreiben; in Vorlagen oder mit **Variablen lesen** abrufen |

Eine Payload ist meist ein JSON-Objekt. `payload` ist außerdem der Name des Feldes mit dem Inhalt einer MQTT-Nachricht. Es ist kein allgemeines Präfix: `resource.name` liegt an der Wurzel, `payload.temperature` dagegen im empfangenen MQTT-Inhalt.

## Welche Daten ein Trigger liefert

Die Anfangsdaten hängen vom Trigger ab. Bei Objekt-Payloads ergänzt Attraccess `resource.id`, `resource.name`, `resource.type` und `resource.metadata`. Die Metadaten enthalten die benutzerdefinierten Daten der Ressource und können `null` sein.

| Trigger                                          | Nützliche Payload-Pfade                                                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**, **Keine Aktivität**                  | Nur Ressourcenkontext; keine Benutzer- oder Nachrichtendaten                                                                                                                             |
| **Nutzung gestartet / beendet**                  | Nutzungsfelder an der Wurzel: `id`, `startTime`, `endTime`, `startNotes`, `endNotes`, `user.id`, `user.username`, `formSubmissions`                                                      |
| **Nutzung übernommen**                           | Felder der bisherigen Sitzung sowie `newUser`, `oldUser`, `takeOverTime`                                                                                                                 |
| **Tür entriegelt / verriegelt / Falle geöffnet** | `event.timestamp`, `usage.start`, `usage.end`, `user.id`, `user.username`, `user.externalIdentifier`                                                                                     |
| **MQTT-Nachricht empfangen**                     | `serverId`, `topic`, `payload`                                                                                                                                                           |
| **Variable geändert**                            | `change.scope`, `change.key`, `change.previousValue`, `change.newValue`, `change.changedAt`, `change.sourceResourceId`; überwachte Werte unter `variables.resource` / `variables.global` |
| **Companion-Ereignisse**                         | Ereignisfelder an der Wurzel, etwa `idleSeconds`, `appName`, `vendorId`; siehe [Knotentypen](flows/node-types.md)                                                                        |
| **Messung starten / Messwert abfragen**          | `metering.sessionId`, `metering.operationId`, `metering.resourceId`, `metering.usageId`, `metering.kind`, `metering.requestedAt`                                                         |

Formularantworten einer Nutzung werden über Formular-ID und Feld-ID adressiert, etwa `formSubmissions.12.answers.34.value`. Nur eingereichte Formulare sind enthalten. Notizen, Endzeiten und optionale Benutzerfelder können leer sein oder fehlen. Nutzungs- und Tür-Trigger liefern unterschiedliche Strukturen; prüfen Sie den tatsächlichen Durchlauf, bevor Sie Pfade wählen.

Eine MQTT-Nachricht auf `workshop/laser/status` mit dem Inhalt `{"temperature":42,"running":true}` liefert nachfolgenden Knoten beispielsweise:

```json
{
  "serverId": 1,
  "topic": "workshop/laser/status",
  "payload": {
    "temperature": 42,
    "running": true
  },
  "resource": {
    "id": 7,
    "name": "Laser cutter",
    "type": "machine",
    "metadata": {
      "mqttTopic": "workshop/laser/command"
    }
  }
}
```

MQTT-Inhalte werden nach Möglichkeit als JSON gelesen, auch Zahlen, boolesche Werte und Arrays. Andernfalls enthält `payload` den unveränderten Text, etwa `ON`.

## Pfade und Vorlagen

Ein **Pfad** wählt einen Wert aus. Eine **Vorlage** erzeugt Text. Verwenden Sie die Form, die die jeweilige Einstellung erwartet:

| Einstellung                        | Beispiel                               | Bedeutung                                  |
| ---------------------------------- | -------------------------------------- | ------------------------------------------ |
| **Wenn → Payload-Pfad**            | `payload.temperature`                  | Temperatur direkt lesen                    |
| **Payload setzen → Schlüssel**     | `reading.temperature`                  | Verschachteltes Feld schreiben             |
| **Variablen lesen → Payload-Pfad** | `limits.temperature`                   | Gespeicherten Wert in dieses Feld kopieren |
| **MQTT senden → Payload**          | `Temperature: {{payload.temperature}}` | Text aus den aktuellen Daten erzeugen      |

Setzen Sie keine `{{ }}` um einen **Wenn**-Pfad. Der Vergleichswert ist entweder wörtlicher Text oder ein weiterer Payload-Pfad, je nach Schalter **Vergleichswert ist ein Payload-Pfad**. Er ist keine Vorlage.

### Vorlagensyntax

Einstellungen mit Vorlagenunterstützung verwenden [Handlebars-Ausdrücke](https://handlebarsjs.com/guide/expressions.html).

| Vorlage                           | Ergebnis mit dem MQTT-Beispiel      |
| --------------------------------- | ----------------------------------- |
| `{{resource.name}}`               | `Laser cutter`                      |
| `{{payload.temperature}}`         | `42`                                |
| `{{resource.metadata.mqttTopic}}` | `workshop/laser/command`            |
| `{{payload.missing}}`             | Leerer Text                         |
| `{{json payload}}`                | `{"temperature":42,"running":true}` |

Verschachtelte Werte verwenden Punkte. Schlüssel, die selbst Punkte enthalten, werden mit Klammern angesprochen: Der Variablenschlüssel `machine.mode` wird mit `{{variables.resource.[machine.mode]}}` gelesen. Ein numerischer Formularpfad lässt sich als `{{formSubmissions.[12].answers.[34].value}}` schreiben.

Handlebars bietet [eingebaute Hilfsfunktionen](https://handlebarsjs.com/guide/builtin-helpers.html), zum Beispiel:

```handlebars
{{#if payload.running}}RUNNING{{else}}STOPPED{{/if}}
```

Verwenden Sie **Wenn**-Knoten für Vergleiche und Verzweigungen. Vorlagen erzeugen Text; sie werten keine JavaScript-Ausdrücke wie `{{payload.temperature > 40}}` aus.

### Escaping und JSON

`{{value}}` maskiert Zeichen wie `&` und Anführungszeichen für HTML. `{{{value}}}` gibt unveränderten Text aus. Für JSON-Nachrichten und HTTP-Bodies verwenden Sie die Attraccess-Hilfsfunktion **`json`**. Sie serialisiert einen Wert und gibt ihn ohne HTML-Maskierung aus:

```handlebars
{ "resourceId":
{{json resource.id}}, "resourceName":
{{json resource.name}}, "reading":
{{json payload}}
}
```

Setzen Sie keine zusätzlichen Anführungszeichen um `{{json resource.name}}`: Die Hilfsfunktion liefert bereits die JSON-Anführungszeichen. Sie verarbeitet auch Objekte, Arrays, Zahlen, boolesche Werte und `null`. Prüfen Sie, dass referenzierte Werte existieren; fehlende Felder können ungültiges JSON erzeugen. Dreifache Klammern allein maskieren weder Text für JSON noch kodieren sie einen Wert für eine URL.

Setzen Sie ein Leerzeichen oder einen Zeilenumbruch zwischen das schließende `}}` einer Vorlage und das schließende `}` eines JSON-Objekts. Direkt nebeneinander als `}}}` können sie einen Handlebars-Parsefehler verursachen.

## Arithmetik und Einheitenumrechnung

Felder mit Vorlagenunterstützung bieten vier Rechenhilfen. Jede erwartet genau zwei Operanden in der Reihenfolge links nach rechts:

| Hilfsfunktion | Beispiel           | Ergebnis |
| ------------- | ------------------ | -------- |
| `add`         | `{{add 2 3}}`      | `5`      |
| `subtract`    | `{{subtract 2 3}}` | `-1`     |
| `multiply`    | `{{multiply 2 3}}` | `6`      |
| `divide`      | `{{divide 3 2}}`   | `1.5`    |

Operanden können feste Zahlen, Payload-Pfade oder Pfade gespeicherter Variablen sein, etwa `{{divide payload.energy_wh variables.resource.scale}}`. Zahlen und numerische Zeichenketten wie `"1500"` sind erlaubt. Verwenden Sie einen Dezimalpunkt, kein Dezimalkomma. Die Hilfsfunktionen sind überall verfügbar, wo eine Knoteneinstellung Vorlagen unterstützt; **Wenn**-Pfade und feste Einstellungen werten weiterhin keine Vorlagen aus.

### Beispiel: Wh in kWh umrechnen

Angenommen, der empfangene MQTT-Inhalt ist `{"energy_wh":1500}`. Konfigurieren Sie in **Payload setzen**:

| Schlüssel            | Wertvorlage                         |
| -------------------- | ----------------------------------- |
| `reading.energy_kwh` | `{{divide payload.energy_wh 1000}}` |
| `reading.unit`       | `kWh`                               |

Das Ergebnis enthält `reading.energy_kwh: "1.5"` und `reading.unit: "kWh"`. **Payload setzen** schreibt weiterhin Text. Mit derselben Wertvorlage in **Variablen setzen** speichern Sie das Ergebnis als JSON-Zahl; **Variablen lesen** kopiert sie bei Bedarf in die Payload.

Um die Umrechnung direkt als JSON-Zahl in einer MQTT-Nachricht oder einem HTTP-Body zu senden, verwenden Sie:

```handlebars
{ "energy_kwh": {{json (divide payload.energy_wh 1000)}} }
```

Dies ergibt `{ "energy_kwh": 1.5 }`. Nach einer bestätigten HTTP-Anfrage mit Antwort `{"energy_wh":1500}` verwenden Sie `energy_wh` anstelle von `payload.energy_wh`.

Für die Energieabrechnung akzeptiert **Energie melden** auch die ursprüngliche Einheit: **Wert** `{{payload.energy_wh}}`, **Einheit** `Wh` meldet 1500 Wh, die Attraccess in 1.5 kWh umrechnet. Dafür ist keine Rechenvorlage nötig. Wenn Sie **Wert** `{{divide payload.energy_wh 1000}}` wählen, kombinieren Sie ihn mit **Einheit** `kWh`. Den erforderlichen Abfragezweig erklärt [Energiemessung](flows/energy-metering.md).

### Rechenoperationen kombinieren

Verschachteln Sie Hilfsfunktionen mit runden Klammern. Celsius wird beispielsweise so in Fahrenheit umgerechnet:

```handlebars
{{add (divide (multiply payload.temperature_c 9) 5) 32}}
```

Bei `temperature_c: 20` ergibt dies `68`. Die Klammern übergeben das innere numerische Ergebnis an die äußere Hilfsfunktion; sie werten kein beliebiges JavaScript aus. `{{payload.energy_wh / 1000}}` ist keine gültige Rechensyntax; `{{payload.energy_wh}} / 1000` erzeugt nur Text wie `1500 / 1000`.

### Ungültige Werte und Genauigkeit

Fehlende Werte, leerer Text, boolesche Werte, `null`, Objekte, Arrays und nicht numerische Zeichenketten führen zu einem Knotenfehler. Division durch null und nicht endliche Ergebnisse, etwa bei Überlauf, führen ebenfalls zum Fehler, statt einen irreführenden Wert auszugeben. Das normale Fehlerverhalten des Knotens gilt; **Payload setzen** stoppt dabei den Flow.

Die Arithmetik verwendet JavaScript-Gleitkommazahlen. Dezimalrechnungen können Rundungsartefakte zeigen, etwa `{{add 0.1 0.2}}` mit dem Ergebnis `0.30000000000000004`. Übergeben Sie für Energieabrechnung den ursprünglichen Wert mit seiner tatsächlichen Einheit an **Energie melden**, damit das Messsystem die Umrechnung und Abrechnung mit seiner eigenen exakten Berechnung durchführt.

## Die Payload ändern

**Payload setzen** erhält vorhandene Felder und schreibt die konfigurierten Einträge **Schlüssel → Wert**. Schlüssel sind feste Pfade; Werte sind Vorlagen. Mit dem MQTT-Beispiel:

| Schlüssel             | Wert                                          |
| --------------------- | --------------------------------------------- |
| `reading.temperature` | `{{payload.temperature}}`                     |
| `command`             | `{{#if payload.running}}ON{{else}}OFF{{/if}}` |

Dies ergänzt `reading.temperature` als **Zeichenkette** `"42"` und `command` als `"ON"`. Auch `true`, `42` oder `{{json payload}}` werden in **Payload setzen** zu Text, nicht zu einem booleschen Wert, einer Zahl oder einem Objekt.

Alle Einträge in einem **Payload setzen**-Knoten lesen dieselbe Eingangs-Payload. Ein Eintrag kann keinen Wert lesen, den ein früherer Eintrag desselben Knotens erzeugt hat. Verwenden Sie einen zweiten Knoten, wenn eine Vorlage vom Ergebnis des ersten abhängt.

### Knoten, die Daten ersetzen

| Knoten                                       | Payload für nachfolgende Knoten                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| **HTTP-Anfrage**, bestätigt (`acknowledged`) | Antwort-Body direkt; `{"energy_wh":1500}` wird mit `{{energy_wh}}` gelesen          |
| **HTTP-Anfrage**, nur senden (`dispatch`)    | Ursprüngliche Payload; kein Antwort-Body                                            |
| **Auf MQTT-Nachricht warten**, Erfolg        | `{ "topic": "…", "payload": … }`; keine vorherigen Felder und keine `serverId`      |
| **Abrechnungsposten hinzufügen**             | Der Posten: `name`, `description`, `externalReference`, `unitPrice`, `quantity`     |
| **PC sperren / entsperren**                  | Eingangs-Felder, wobei `companion` durch `{ "delivered": true/false }` ersetzt wird |

Bei einem Objekt als Ergebnis wird der Ressourcenkontext erneut ergänzt. Gespeicherte Variablen bleiben in Vorlagen verfügbar. Arrays, Text und andere HTTP-Antworten ohne Objektstruktur erhalten keinen zusätzlichen Ressourcen- oder Variablenkontext.

Wenn spätere Knoten frühere Ereignisdaten benötigen, speichern Sie die nötigen Werte vor dem ersetzenden Knoten mit **Variablen setzen** und lesen sie danach wieder. Zusätzliche Felder aus **Payload setzen** überleben eine bestätigte HTTP-Antwort nicht.

Wenn ein Ausgang mehrere Knoten verbindet, laufen seine Zweige gleichzeitig. Werden diese Zweige mit demselben Knoten verbunden, läuft dieser einmal je eingehender Verbindung; er führt die Payloads nicht zusammen. Verlassen Sie sich nicht auf eine Reihenfolge zwischen Zweigen.

## Dauerhaft gespeicherte Flow-Variablen

Öffnen Sie **Variablen** im Flow-Editor, um gespeicherte Werte anzusehen, anzulegen, zu bearbeiten oder zu löschen. Der Dialog bietet Text, Zahl, Boolean, Objekt, Array und Null als Typen.

| Geltungsbereich | Sichtbarkeit              | Vorlage                                    |
| --------------- | ------------------------- | ------------------------------------------ |
| **Ressource**   | Flows derselben Ressource | `{{variables.resource.targetTemperature}}` |
| **Global**      | Flows aller Ressourcen    | `{{variables.global.workshopOpen}}`        |

Ressourcen- und globale Schlüssel sind unabhängig. Beide können einen Schlüssel `mode` besitzen. Schlüssel sind wörtliche Namen: `machine.mode` erzeugt kein verschachteltes Objekt.

Bei Objekt-Payloads können Vorlagen gespeicherte Variablen ohne **Variablen lesen** verwenden. Die Werte werden um jede Knotenausführung herum geladen. Sie sind zusätzlicher Vorlagenkontext und normalerweise keine Felder in der protokollierten Payload. **Wenn** liest nur die Payload; kopieren Sie daher eine Variable vor dem Vergleich mit **Variablen lesen** in die Payload.

### Werte mit ihrem Typ speichern

**Variablen setzen** rendert Schlüssel und Wert und versucht anschließend, den Wert als JSON zu lesen. Schlägt das fehl, wird der gerenderte Text gespeichert.

| Wertvorlage        | Gespeicherter Wert                              |
| ------------------ | ----------------------------------------------- |
| `42`               | Zahl `42`                                       |
| `true`             | Boolescher Wert `true`                          |
| `null`             | Null                                            |
| `{"limit":40}`     | Objekt                                          |
| `["ready","busy"]` | Array                                           |
| `ready`            | Text `ready`                                    |
| `"42"`             | Text `42`                                       |
| `{{json payload}}` | Empfangener MQTT-Inhalt mit erhaltenem JSON-Typ |

Mit `{{json someTextField}}` erhalten Sie beliebigen Text als JSON-Zeichenkette. Werte innerhalb eines **Variablen setzen**-Knotens verwenden dessen Eingangskontext; verwenden Sie getrennte Knoten, wenn eine spätere Zuweisung eine aktualisierte Variable lesen soll. Schreibvorgänge ersetzen den gespeicherten Wert. Gleichzeitige Durchläufe können sich gegenseitig überschreiben; dies ist keine atomare Zähleroperation.

### Lesen und auf Änderungen reagieren

**Variablen lesen** kopiert den gespeicherten Wert mit erhaltenem Typ an einen konfigurierten Payload-Pfad. Ein fehlender Schlüssel ergibt einen undefinierten Wert und eine Warnung im Serverprotokoll; der Knoten schlägt deshalb nicht fehl. Prüfen oder initialisieren Sie benötigte Werte vor ihrer Verwendung.

**Variable geändert** startet einen neuen Durchlauf, wenn ein überwachter Wert angelegt oder geändert wird. Derselbe Wert löst keinen erneuten Durchlauf aus; Löschen löst ebenfalls keinen aus. **Jede Änderung** umfasst Schreibvorgänge derselben Ressource. **Nur Änderungen von anderen Ressourcen** (`exclude-self`) überspringt Änderungen aus der Ressource des Triggers, nicht nur aus demselben Knoten. Vermeiden Sie Zyklen, die den überwachten Wert immer wieder ändern.

## Beispiel: Messwert mit gespeichertem Grenzwert vergleichen

1. Legen Sie unter **Variablen** eine Ressourcenvariable `targetTemperature` vom Typ **Zahl** mit dem Wert `40` an.
2. Fügen Sie **MQTT-Nachricht empfangen** für Ihren Server und das Topic `workshop/laser/status` hinzu.
3. Verbinden Sie **Variablen lesen**: Geltungsbereich **Ressource**, Schlüssel `targetTemperature`, Payload-Pfad `limits.temperature`.
4. Verbinden Sie **Wenn**: Payload-Pfad `payload.temperature`, Operator `>`, aktivieren Sie **Vergleichswert ist ein Payload-Pfad**, Vergleichswert `limits.temperature`.
5. Verbinden Sie **Wahr** mit **MQTT-Nachricht senden**. Wählen Sie den Server, Topic `workshop/laser/alarm` und Payload `{"temperature": {{json payload.temperature}}, "limit": {{json limits.temperature}} }`.

Beim Beispielwert `42` sendet der Wahr-Zweig `{"temperature":42,"limit":40}`. **Wenn** wandelt Werte für `>`, `<`, `>=`, `<=` in Zahlen um; Gleichheit und Ungleichheit vergleichen Zeichenketten.

## Durchläufe prüfen und Fehler finden

Öffnen Sie **Flow-Protokolle**, wählen Sie eine Aufzeichnungsdauer und klicken Sie vor dem Auslösen auf **Aufzeichnung starten**. Prüfen Sie `input` und `output` der Knoteneinträge, um genaue Pfade und Änderungen der Felder zu sehen. Protokolle werden während der Aufzeichnung gesammelt und bleiben bis zum Verlassen oder Neuladen der Seite sichtbar.

| Symptom                                | Prüfen                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Eine Vorlage bleibt leer               | Feld im Eingang dieses Knotens vorhanden; richtige Trigger-Struktur und richtiger Geltungsbereich                            |
| Eine JSON-Nachricht ist ungültig       | `json` verwenden, keine zusätzlichen Anführungszeichen darum setzen, referenzierte Werte prüfen                              |
| Ein Objekt wird zu `[object Object]`   | Mit `{{json payload}}` serialisieren                                                                                         |
| **Wenn** nimmt den falschen Zweig      | Pfade ohne Klammern; Vergleichspfad-Schalter und Zahlenwerte prüfen                                                          |
| Frühere Ereignisfelder verschwinden    | Bestätigte HTTP-Anfrage, MQTT-Warteknoten oder Abrechnungsknoten hat die Payload ersetzt                                     |
| Ein Feld enthält `"true"` statt `true` | **Payload setzen** schreibt Text; **Variablen setzen** und **Variablen lesen** erhalten Typen                                |
| Ein Fehleranschluss wird nie verwendet | **Bei Fehler** auf Weiterleitung über den Fehlerausgang setzen; siehe [Fehlerverhalten](flows/node-types.md#fehlerverhalten) |

## Siehe auch

- [Knotentypen](flows/node-types.md) — Einstellungen, Vorlagenunterstützung und Payload-Verhalten aller Core-Knoten
- [Flow-Editor](flows/flow-editor.md) — Knoten hinzufügen und verbinden
- [Energiemessung](flows/energy-metering.md) — Zählerwerte lesen und melden
