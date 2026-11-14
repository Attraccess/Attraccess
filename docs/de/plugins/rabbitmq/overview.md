# RabbitMQ
<!-- llms-description: Das Plugin RabbitMQ ergänzt die Detailseite eines MQTT-Servers um Status-, Benutzer-, Verbindungs- und Statistik-Bereiche für RabbitMQ-Broker; Voraussetzungen und Berechtigungen. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **RabbitMQ** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Mit dem Plugin **RabbitMQ** verwalten Sie einen RabbitMQ-Broker aus Attraccess. Es ergänzt die Detailseite eines MQTT-Servers um zusätzliche Bereiche, wenn Attraccess den Server als RabbitMQ-Broker erkennt. Die MQTT-Funktionen selbst (Server, Flows, Nachrichten-Explorer) gehören zu Attraccess und funktionieren ohne das Plugin; siehe [MQTT](mqtt/overview.md).

## Voraussetzungen

- Attraccess 1.11.0 oder neuer und das Plugin `rabbitmq`, installiert wie unter [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es benötigt die Berechtigung `ACCESS_MQTT_SERVERS`.
- Ein in Attraccess eingerichteter [MQTT-Server](mqtt/server-setup.md), der auf einen RabbitMQ-Broker zeigt. Für das MQTT-Protokoll aktivieren Sie das Plugin `rabbitmq_mqtt` am Broker, siehe [RabbitMQ mit MQTT-Plugin](mqtt/server-setup.md#rabbitmq-mit-mqtt-plugin).
- Das RabbitMQ-Management-Plugin mit seiner HTTP-API, von Attraccess aus erreichbar.

## RabbitMQ aus Attraccess verwalten

Zeigt ein MQTT-Server, den Attraccess als RabbitMQ-Broker erkennt, auf seiner Detailseite (Seitenleiste **Geräte → MQTT-Server**, dann den Server auswählen) zusätzliche Bereiche. Attraccess nutzt dafür die RabbitMQ-Management-API (Port `15672`, mit TLS `15671`, sofern kein Management-Port konfiguriert ist) mit Benutzername und Passwort des MQTT-Servers.

| Bereich | Funktion | RabbitMQ-Benutzer-Tag | Attraccess-Berechtigung |
|---------|----------|-----------------------|-------------------------|
| **RabbitMQ** (Status) | Erreichbarkeit, Prüfung der Zugangsdaten, Versionen | `monitoring` | `resources.update` |
| **RabbitMQ-Benutzer** | Benutzer und ihre Vhost-Berechtigungen anzeigen | `administrator` | `resources.update` |
| **RabbitMQ-Benutzer** (ändern) | Benutzer anlegen, bearbeiten, löschen; Berechtigungen setzen oder entfernen | `administrator` | `system.settings.manage` |
| **Verbindungen** | Aktive Client-Verbindungen (Aktualisierung alle 10 s) | `monitoring` | `resources.update` |
| **Verbindungen** (schließen) | Verbindung zwangsweise trennen, optional mit Grund | `administrator` | `system.settings.manage` |
| **Broker-Statistiken** | Überblick, Knoten und Queues (Aktualisierung alle 15 s) | `monitoring` | `resources.update` |

Hinweise:

- Der am MQTT-Server konfigurierte Benutzer benötigt das Tag aus der Tabelle (`administrator` deckt alles ab, was `monitoring` kann). Fehlt es, zeigen die Bereiche eine Fehlermeldung, die die fehlende Berechtigung nennt.
- Benutzer ohne `system.settings.manage` sehen nur die lesenden Bereiche; Schreibaktionen sind ausgeblendet und werden auch vom Server abgelehnt.
- Live-MQTT-Nachrichten beobachten und senden gehört nicht zum RabbitMQ-Plugin. Das geht für jeden MQTT-Server und braucht nur `resources.update` -- siehe [MQTT-Nachrichten-Explorer](mqtt/message-explorer.md).
