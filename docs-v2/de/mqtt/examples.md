# MQTT-Beispiele

Diese Seite zeigt praktische Beispiele, wie Sie MQTT mit Attraccess verwenden koennen, um Maschinen zu steuern, Sensordaten zu empfangen und Ihren Makerspace zu automatisieren.

> [!NOTE]
> Alle Beispiele setzen voraus, dass Sie bereits [einen MQTT-Broker verbunden](mqtt/server-setup.md) haben und mit den Grundlagen von [Flows](flows/overview.md) vertraut sind.

## Beispiel 1: Maschinensteuerung ueber MQTT-Relais

**Ziel:** Eine Maschine automatisch einschalten, wenn ein Benutzer die Nutzung startet, und ausschalten, wenn er aufhoert.

### Was Sie benoetigen

- Ein intelligentes Relais oder eine schaltbare Steckdose, die mit Ihrem MQTT-Broker verbunden ist
- Das Relais lauscht auf ein Topic wie `werkstatt/laser/strom`

### Flow-Einrichtung

Erstellen Sie einen Flow auf der Lasercutter-Ressource mit zwei Pfaden:

**Einschalten:**

1. Fuegen Sie einen **Eingabe**-Knoten hinzu: **Nutzung gestartet**
2. Verbinden Sie ihn mit einem **Ausgabe**-Knoten: **MQTT Publish**
3. Konfigurieren Sie den MQTT-Knoten:

| Einstellung | Wert |
|-------------|------|
| **Server** | Ihr MQTT-Broker |
| **Topic** | `werkstatt/laser/strom` |
| **Payload** | `ON` |

**Ausschalten:**

1. Fuegen Sie einen **Eingabe**-Knoten hinzu: **Nutzung beendet**
2. Verbinden Sie ihn mit einem **Ausgabe**-Knoten: **MQTT Publish**
3. Konfigurieren Sie den MQTT-Knoten:

| Einstellung | Wert |
|-------------|------|
| **Server** | Ihr MQTT-Broker |
| **Topic** | `werkstatt/laser/strom` |
| **Payload** | `OFF` |

<!-- TODO: Screenshot des Stromsteuerungs-Flows im Editor -->

> [!TIP]
> Viele intelligente Relais (Shelly, Sonoff, Tasmota) unterstuetzen MQTT direkt. Pruefen Sie die Dokumentation Ihres Geraets fuer das korrekte Topic- und Payload-Format.

---

## Beispiel 2: Sensordaten von einer Maschine empfangen

**Ziel:** Temperaturdaten eines 3D-Druckers ueberwachen und in Attraccess anzeigen.

### Was Sie benoetigen

- Einen Temperatursensor, der mit Ihrem MQTT-Broker verbunden ist
- Der Sensor veroeffentlicht Daten auf einem Topic wie `werkstatt/3ddrucker/temperatur`

### Flow-Einrichtung

1. Fuegen Sie einen **Eingabe**-Knoten hinzu: **MQTT Subscribe**
2. Konfigurieren Sie den MQTT-Knoten:

| Einstellung | Wert |
|-------------|------|
| **Server** | Ihr MQTT-Broker |
| **Topic** | `werkstatt/3ddrucker/temperatur` |

3. Verbinden Sie ihn mit einem **Verarbeitungs**-Knoten (z.B. **Wenn**-Bedingung), um zu pruefen, ob die Temperatur einen Schwellenwert ueberschreitet
4. Verbinden Sie die Bedingung mit einem **Ausgabe**-Knoten (z.B. **HTTP-Anfrage**, um eine Benachrichtigung zu senden)

### Beispiel: Temperaturwarnung

| Knoten | Konfiguration |
|--------|--------------|
| **MQTT Subscribe** | Topic: `werkstatt/3ddrucker/temperatur` |
| **Wenn-Bedingung** | `payload.value > 250` |
| **HTTP-Anfrage** | Warnung an Ihren Benachrichtigungsdienst senden |

<!-- TODO: Screenshot des Sensorueberwachungs-Flows -->

> [!NOTE]
> Das genaue Payload-Format haengt von Ihrem Sensor ab. Gaengige Formate sind einfache Zahlen (`42.5`) oder JSON (`{"value": 42.5, "unit": "celsius"}`).

---

## Beispiel 3: MQTT in Flows fuer Ressourcen-Nutzungsereignisse

**Ziel:** MQTT-Nachrichten an mehrere Geraete senden, wenn eine Ressourcen-Nutzungssitzung startet oder endet -- zum Beispiel eine Maschine einschalten, die Absaugung aktivieren und die Raumbeleuchtung einschalten.

### Was Sie benoetigen

- Mehrere MQTT-faehige Geraete, die mit Ihrem Broker verbunden sind
- Jedes Geraet lauscht auf sein eigenes Topic

### Flow-Einrichtung

1. Fuegen Sie einen **Eingabe**-Knoten hinzu: **Nutzung gestartet**
2. Verbinden Sie ihn mit mehreren **Ausgabe**-Knoten (MQTT Publish), einen fuer jedes Geraet:

| Geraet | Topic | Payload |
|--------|-------|---------|
| Lasercutter | `werkstatt/laser/strom` | `ON` |
| Absaugung | `werkstatt/absaugung/strom` | `ON` |
| Raumlicht | `werkstatt/licht/zone3` | `ON` |

3. Wiederholen Sie dies mit einem **Nutzung beendet**-Eingabeknoten, der mit denselben Topics mit `OFF`-Payloads verbunden ist

<!-- TODO: Screenshot des Multi-Geraete-Flows -->

> [!TIP]
> Sie koennen einen **Warten**-Knoten zwischen dem Maschinen-Einschalten und der Absaugung einfuegen, um der Maschine Zeit zum Hochfahren zu geben, bevor die Absaugung aktiviert wird.

## MQTT mit anderen Knoten kombinieren

MQTT-Knoten koennen frei mit anderen Flow-Knoten fuer fortgeschrittenere Szenarien kombiniert werden:

- **Warten** -- Eine Verzoegerung vor dem Senden einer MQTT-Nachricht hinzufuegen
- **Wenn-Bedingung** -- Eine Nachricht nur senden, wenn bestimmte Bedingungen erfuellt sind
- **Payload setzen** -- Daten vor dem Veroeffentlichen ueber MQTT transformieren
- **HTTP-Anfrage** -- MQTT mit Webservice-Aufrufen kombinieren

Siehe [Knotentypen](flows/node-types.md) fuer eine vollstaendige Liste der verfuegbaren Knoten.

## Siehe auch

- [Ueberblick](mqtt/overview.md) -- Was ist MQTT?
- [Server einrichten](mqtt/server-setup.md) -- Attraccess mit einem MQTT-Broker verbinden
- [Flows & Automatisierung](flows/overview.md) -- Automatisierungs-Workflows erstellen
- [Flow-Editor](flows/flow-editor.md) -- Den visuellen Editor verwenden
- [Knotentypen](flows/node-types.md) -- Alle verfuegbaren Knotentypen
