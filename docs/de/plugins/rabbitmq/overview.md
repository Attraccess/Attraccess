# RabbitMQ

<!-- llms-description: Das Plugin RabbitMQ ergänzt die Detailseite eines MQTT-Servers um Status-, Benutzer-, Verbindungs- und Statistik-Bereiche für RabbitMQ-Broker; Voraussetzungen und Berechtigungen. -->

> [!NOTE]
> Nur verfügbar, wenn das Plugin **RabbitMQ** installiert ist. Siehe [Plugins installieren](plugins/installing-plugins.md).

Mit dem Plugin **RabbitMQ** verwalten Sie einen RabbitMQ-Broker aus Attraccess. Es ergänzt die Detailseite eines MQTT-Servers um zusätzliche Bereiche, wenn Attraccess den Server als RabbitMQ-Broker erkennt. Die MQTT-Funktionen selbst (Server, Flows, Nachrichten-Explorer) gehören zu Attraccess und funktionieren ohne das Plugin; siehe [MQTT](mqtt/overview.md).

## Voraussetzungen

- Attraccess 1.11.0 oder neuer und das Plugin `rabbitmq`, installiert wie unter [Plugins installieren](plugins/installing-plugins.md) beschrieben. Es benötigt die Berechtigung `ACCESS_MQTT_SERVERS`.
- Ein in Attraccess eingerichteter [MQTT-Server](mqtt/server-setup.md), der auf einen RabbitMQ-Broker zeigt. Für das MQTT-Protokoll aktivieren Sie das Plugin `rabbitmq_mqtt` am Broker, siehe [RabbitMQ mit MQTT-Plugin](mqtt/server-setup.md#rabbitmq-mit-mqtt-plugin).
- Das RabbitMQ-Management-Plugin mit seiner HTTP-API, von Attraccess aus erreichbar.

## Wo es erscheint

Auf der Detailseite eines MQTT-Servers, den Attraccess als RabbitMQ-Broker erkennt (Seitenleiste **Geräte → MQTT-Server**, dann den Server auswählen).

## RabbitMQ aus Attraccess verwalten

Attraccess nutzt dafür die RabbitMQ-Management-API (Port `15672`, mit TLS `15671`, sofern kein Management-Port konfiguriert ist) mit Benutzername und Passwort des MQTT-Servers.

| Bereich                        | Funktion                                                                    | RabbitMQ-Benutzer-Tag | Attraccess-Berechtigung  |
| ------------------------------ | --------------------------------------------------------------------------- | --------------------- | ------------------------ |
| **RabbitMQ** (Status)          | Erreichbarkeit, Prüfung der Zugangsdaten, Versionen                         | `monitoring`          | `rabbitmq.broker.read`   |
| **RabbitMQ-Benutzer**          | Benutzer und ihre Vhost-Berechtigungen anzeigen                             | `administrator`       | `rabbitmq.broker.read`   |
| **RabbitMQ-Benutzer** (ändern) | Benutzer anlegen, bearbeiten, löschen; Berechtigungen setzen oder entfernen | `administrator`       | `rabbitmq.broker.manage` |
| **Verbindungen**               | Aktive Client-Verbindungen (Aktualisierung alle 10 s)                       | `monitoring`          | `rabbitmq.broker.read`   |
| **Verbindungen** (schließen)   | Verbindung zwangsweise trennen, optional mit Grund                          | `administrator`       | `rabbitmq.broker.manage` |
| **Broker-Statistiken**         | Überblick, Knoten und Queues (Aktualisierung alle 15 s)                     | `monitoring`          | `rabbitmq.broker.read`   |

Hinweise:

- Der am MQTT-Server konfigurierte Benutzer benötigt das Tag aus der Tabelle (`administrator` deckt alles ab, was `monitoring` kann). Fehlt es, zeigen die Bereiche eine Fehlermeldung, die die fehlende Berechtigung nennt.
- Benutzer ohne `rabbitmq.broker.manage` sehen nur die lesenden Bereiche; Schreibaktionen sind ausgeblendet und werden auch vom Server abgelehnt.
- Live-MQTT-Nachrichten beobachten und senden gehört nicht zum RabbitMQ-Plugin. Das geht für jeden MQTT-Server und braucht nur `resources.update` -- siehe [MQTT-Nachrichten-Explorer](mqtt/message-explorer.md).

### Attraccess-Berechtigungen

Das RabbitMQ-Plugin deklariert eigene Berechtigungsschlüssel. Sie erscheinen im Rollen-Editor und in der Auswahl für
API-Tokens in der Gruppe **RabbitMQ** (siehe [Berechtigungen](user-management/permissions.md#plugin-berechtigungen)).

| Schlüssel                | Erlaubt                                                                            | Standardrollen                                      |
| ------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| `rabbitmq.broker.read`   | Die lesenden Bereiche: Status, Benutzer, Verbindungen, Broker-Statistiken          | `administrator`, `resource-manager`, `system-admin` |
| `rabbitmq.broker.manage` | RabbitMQ-Benutzer und ihre Berechtigungen ändern, Verbindungen zwangsweise trennen | `administrator`, `system-admin`                     |

Die Bereiche liegen auf der Detailseite des MQTT-Servers, die selbst `resources.update` erfordert.

**Upgrade:** Vor dieser Version nutzten die Bereiche `resources.update` (anzeigen) und `system.settings.manage`
(verwalten). Die Systemrollen behalten ihren Zugriff. Eigene Rollen, die sich für RabbitMQ auf diese Kernschlüssel
verlassen haben, verlieren ihn, bis Sie ihnen `rabbitmq.broker.read` oder `rabbitmq.broker.manage` hinzufügen.
