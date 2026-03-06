# MQTT-Server einrichten

Diese Anleitung erklaert, wie Sie Attraccess mit einem MQTT-Broker verbinden, um MQTT in Ihren Automatisierungs-Flows nutzen zu koennen.

## Voraussetzungen

Bevor Sie beginnen, benoetigen Sie:

- Einen laufenden MQTT-Broker (siehe [Gaengige Broker](#gaengige-broker) weiter unten)
- Den Hostnamen, Port und die Zugangsdaten des Brokers
- Administratorberechtigungen in Attraccess

## MQTT-Server hinzufuegen

1. Navigieren Sie zu **MQTT** in der Seitenleiste
2. Klicken Sie auf **Server**
3. Klicken Sie auf **Server hinzufuegen**
4. Geben Sie die Verbindungsdetails ein:

| Feld | Beschreibung | Beispiel |
|------|-------------|---------|
| **Name** | Ein beschreibender Name fuer diese Verbindung | `Werkstatt-Broker` |
| **Host** | Hostname oder IP-Adresse des MQTT-Brokers | `mqtt.example.com` |
| **Port** | MQTT-Port | `1883` (Standard) oder `8883` (TLS) |
| **Benutzername** | Anmelde-Benutzername (falls erforderlich) | `attraccess` |
| **Passwort** | Anmelde-Passwort (falls erforderlich) | |
| **TLS verwenden** | Verschluesselte Verbindung aktivieren | Fuer Produktionsumgebungen empfohlen |

5. Klicken Sie auf **Speichern**

<!-- TODO: Screenshot des Dialogs "MQTT-Server hinzufuegen" -->

## Verbindung testen

Nach dem Hinzufuegen eines Servers koennen Sie testen, ob Attraccess eine Verbindung herstellen kann:

1. Oeffnen Sie den soeben erstellten Server
2. Klicken Sie auf **Verbindung testen**
3. Attraccess versucht, sich mit dem Broker zu verbinden, und meldet Erfolg oder Misserfolg

> [!NOTE]
> Wenn der Verbindungstest fehlschlaegt, ueberpruefen Sie, ob Hostname, Port und Zugangsdaten korrekt sind. Stellen Sie ausserdem sicher, dass Ihre Firewall den Datenverkehr auf dem MQTT-Port erlaubt.

## Gaengige Broker

Hier sind einige beliebte MQTT-Broker, die Sie mit Attraccess verwenden koennen:

| Broker | Beschreibung | Standard-Port |
|--------|-------------|--------------|
| **Mosquitto** | Leichtgewichtiger, quelloffener Broker. Einfach mit Docker einzurichten | `1883` |
| **RabbitMQ** | Voll ausgestatteter Message-Broker mit MQTT-Plugin | `1883` |
| **HiveMQ** | Enterprise-MQTT-Broker mit kostenloser Community Edition | `1883` |

### Mosquitto mit Docker

Der einfachste Weg, einen MQTT-Broker zu betreiben, ist Mosquitto in Docker:

```yaml
services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - mosquitto-data:/mosquitto/data
      - mosquitto-config:/mosquitto/config

volumes:
  mosquitto-data:
  mosquitto-config:
```

> [!TIP]
> Wenn Sie Attraccess bereits mit Docker Compose betreiben, koennen Sie den Mosquitto-Service in dieselbe `docker-compose.yml`-Datei aufnehmen.

### RabbitMQ mit MQTT-Plugin

Wenn Sie bereits RabbitMQ verwenden, aktivieren Sie das MQTT-Plugin:

```bash
rabbitmq-plugins enable rabbitmq_mqtt
```

RabbitMQ akzeptiert dann MQTT-Verbindungen standardmaessig auf Port `1883`.

## Mehrere Server

Sie koennen Attraccess mit mehreren MQTT-Brokern verbinden. Dies ist nuetzlich, wenn:

- Verschiedene Maschinen unterschiedliche Broker verwenden
- Sie separate Broker fuer Produktion und Tests haben
- Verschiedene Bereiche Ihres Makerspaces separate Netzwerke verwenden

## Verbindungsstatus

Die Server-Seite zeigt den aktuellen Verbindungsstatus fuer jeden Broker:

| Status | Beschreibung |
|--------|-------------|
| **Verbunden** | Attraccess ist mit dem Broker verbunden |
| **Getrennt** | Keine aktive Verbindung -- pruefen Sie die Konfiguration oder die Verfuegbarkeit des Brokers |
| **Verbindungsaufbau** | Attraccess versucht, eine Verbindung herzustellen |
| **Fehler** | Verbindung fehlgeschlagen -- siehe Fehlerdetails fuer weitere Informationen |

## Fehlerbehebung

| Problem | Loesung |
|---------|---------|
| Verbindung abgelehnt | Ueberpruefen Sie, ob Host und Port korrekt sind. Stellen Sie sicher, dass der Broker laeuft |
| Authentifizierung fehlgeschlagen | Ueberpruefen Sie Benutzername und Passwort |
| Zeitueberschreitung | Stellen Sie sicher, dass der Broker vom Attraccess-Server aus erreichbar ist (Firewalls pruefen) |
| TLS-Fehler | Ueberpruefen Sie Ihre TLS-Konfiguration und Zertifikate |

## Siehe auch

- [Ueberblick](mqtt/overview.md) -- Was ist MQTT?
- [Beispiele](mqtt/examples.md) -- Praktische MQTT-Integrationsbeispiele
- [Flows & Automatisierung](flows/overview.md) -- Automatisierungs-Workflows erstellen
- [Umgebungsvariablen](installation/environment-variables.md) -- Serverkonfiguration
