# RabbitMQ

<!-- llms-description: The RabbitMQ plugin adds status, user, connection and statistics panels for RabbitMQ brokers to an MQTT server's detail page; prerequisites and permissions. -->

> [!NOTE]
> Only available when the **RabbitMQ** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **RabbitMQ** plugin lets you manage a RabbitMQ broker from Attraccess. It adds extra panels to the detail page of an MQTT server when Attraccess detects that the server is a RabbitMQ broker. The MQTT features themselves (servers, flows, the message explorer) are part of Attraccess and work without the plugin; see [MQTT](devices/mqtt/overview.md).

## Prerequisites

- Attraccess 1.11.0 or newer and the `rabbitmq` plugin, installed as described in [Installing Plugins](plugins/installing-plugins.md). It needs the `ACCESS_MQTT_SERVERS` permission.
- An [MQTT server](devices/mqtt/server-setup.md) configured in Attraccess that points to a RabbitMQ broker. For the MQTT protocol, enable the `rabbitmq_mqtt` plugin on the broker, see [RabbitMQ with MQTT Plugin](devices/mqtt/server-setup.md#rabbitmq-with-mqtt-plugin).
- The RabbitMQ management plugin and its HTTP API, reachable from Attraccess.

## Where it appears

On the detail page of an MQTT server that Attraccess detects as a RabbitMQ broker (sidebar **Devices → MQTT Servers**, then select the server).

## Managing RabbitMQ from Attraccess

Attraccess talks to the RabbitMQ management API (port `15672`, or `15671` with TLS, unless you configured a management port) using the MQTT server's username and password.

| Panel                       | What it offers                                       | RabbitMQ user tag | Attraccess permission    |
| --------------------------- | ---------------------------------------------------- | ----------------- | ------------------------ |
| **RabbitMQ** (status)       | Reachability, credentials check, versions            | `monitoring`      | `rabbitmq.broker.read`   |
| **RabbitMQ users**          | List users and their vhost permissions               | `administrator`   | `rabbitmq.broker.read`   |
| **RabbitMQ users** (change) | Create, edit, delete users; set or clear permissions | `administrator`   | `rabbitmq.broker.manage` |
| **Connections**             | Live client connections (refreshes every 10 s)       | `monitoring`      | `rabbitmq.broker.read`   |
| **Connections** (close)     | Force-close a connection, with an optional reason    | `administrator`   | `rabbitmq.broker.manage` |
| **Broker statistics**       | Overview, nodes and queues (refreshes every 15 s)    | `monitoring`      | `rabbitmq.broker.read`   |

Notes:

- The user configured on the MQTT server needs the RabbitMQ tag from the table (`administrator` also covers everything `monitoring` can do). Without it the panels show an error that names the missing privilege.
- Users without `rabbitmq.broker.manage` only see the read-only panels; write actions are hidden and are also refused by the server.
- Watching and publishing live MQTT messages is not part of the RabbitMQ plugin. It is available for every MQTT server and needs only `resources.update` -- see [MQTT Message Explorer](devices/mqtt/message-explorer.md).

### Attraccess permissions

The RabbitMQ plugin declares its own permission keys. They appear in the role editor and the API-token picker in the
**RabbitMQ** group (see [Permissions](user-management/permissions.md#plugin-permissions)).

| Key                      | Allows                                                                   | Default roles                                       |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `rabbitmq.broker.read`   | The read-only panels: status, users, connections, broker statistics      | `administrator`, `resource-manager`, `system-admin` |
| `rabbitmq.broker.manage` | Changing RabbitMQ users and their permissions, force-closing connections | `administrator`, `system-admin`                     |

The panels sit on the MQTT server detail page, which itself needs `resources.update`.

**Upgrading:** before this release the panels used `resources.update` (view) and `system.settings.manage` (manage).
The system roles keep their access. Custom roles that relied on those core keys for RabbitMQ lose it until you add
`rabbitmq.broker.read` or `rabbitmq.broker.manage` to them.
