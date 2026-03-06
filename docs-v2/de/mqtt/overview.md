# MQTT & IoT

MQTT ist ein leichtgewichtiges Nachrichtenprotokoll, das haeufig in IoT-Anwendungen (Internet of Things) eingesetzt wird. Attraccess kann sich mit MQTT-Brokern verbinden, um mit Maschinen, Sensoren und anderen Geraeten in Ihrem Makerspace zu kommunizieren.

## Was ist MQTT?

MQTT (Message Queuing Telemetry Transport) ist ein Protokoll zum Senden und Empfangen kleiner Nachrichten zwischen Geraeten. Es arbeitet nach dem Publish/Subscribe-Modell:

- **Publish** -- Ein Geraet sendet eine Nachricht an ein Topic (z.B. `werkstatt/laser/strom`)
- **Subscribe** -- Ein Geraet lauscht auf Nachrichten zu einem Topic
- **Broker** -- Ein Server, der Nachrichten zwischen Publishern und Subscribern vermittelt

## Warum MQTT mit Attraccess verwenden?

MQTT ermoeglicht es Attraccess, mit physischer Hardware in Ihrem Makerspace zu interagieren:

| Anwendungsfall | Beschreibung |
|----------------|-------------|
| **Maschinensteuerung** | Maschinen ein-/ausschalten, wenn ein Benutzer eine Nutzungssitzung startet oder beendet |
| **Sensorueberwachung** | Daten von Sensoren empfangen (Temperatur, Stromverbrauch etc.) |
| **Sicherheitssysteme** | Not-Aus-Taster oder Tuersensoren ueberwachen |
| **Automatisierung** | Aktionen basierend auf Maschinenzustaenden oder Benutzeraktivitaeten ausloesen |

<!-- TODO: Screenshot der MQTT-Integration in Attraccess -->

## Wie es in Attraccess funktioniert

1. Sie verbinden Attraccess mit einem MQTT-Broker (siehe [Server einrichten](mqtt/server-setup.md))
2. Sie erstellen [Flows](flows/overview.md), die MQTT-Knoten zum Senden oder Empfangen von Nachrichten verwenden
3. Wenn ein Flow ausgeloest wird, veroeffentlicht oder abonniert Attraccess MQTT-Topics
4. Ihre Maschinen und Geraete reagieren auf diese Nachrichten (oder senden sie)

> [!NOTE]
> Attraccess enthaelt keinen integrierten MQTT-Broker. Sie muessen einen separaten Broker wie Mosquitto, RabbitMQ oder HiveMQ betreiben.

## Integration mit Flows

MQTT ist tief in das [Flow-System](flows/overview.md) integriert. Sie koennen MQTT-Knoten in Flows verwenden, um:

- **Nachrichten zu senden**, wenn eine Ressourcennutzung startet oder endet
- **Nachrichten zu empfangen** von Geraeten und sie als Flow-Trigger zu verwenden
- **Kombinieren** von MQTT mit anderen Flow-Knoten (Bedingungen, Verzoegerungen, HTTP-Anfragen)

> [!TIP]
> Beginnen Sie mit einem einfachen Setup -- verbinden Sie ein intelligentes Relais mit Ihrem MQTT-Broker und erstellen Sie einen Flow, der es einschaltet, wenn ein Benutzer eine Maschine nutzt.

## Erste Schritte

1. Richten Sie einen MQTT-Broker ein (oder verwenden Sie einen vorhandenen)
2. [Verbinden Sie Attraccess mit dem Broker](mqtt/server-setup.md)
3. Erstellen Sie Flows, die MQTT-Knoten verwenden
4. Verbinden Sie Ihre Maschinen und Sensoren mit demselben Broker

## Siehe auch

- [Server einrichten](mqtt/server-setup.md) -- Attraccess mit einem MQTT-Broker verbinden
- [Beispiele](mqtt/examples.md) -- Praktische MQTT-Integrationsbeispiele
- [Flows & Automatisierung](flows/overview.md) -- Automatisierungs-Workflows erstellen
- [Knotentypen](flows/node-types.md) -- Alle verfuegbaren Flow-Knoten einschliesslich MQTT
