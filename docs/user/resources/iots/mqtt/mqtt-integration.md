# MQTT Integration for Attraccess

This documentation covers the MQTT integration feature that allows Attraccess to publish messages to MQTT servers when resources are used or released.

## Overview

The MQTT integration allows administrators to configure resource-specific messaging to MQTT servers. This enables integration with external systems and IoT devices to react to resource usage events.

When a resource is used or released, Attraccess can automatically publish messages to one or more MQTT servers, which can trigger actions like turning on/off lights, managing power to workstations, or updating status displays.

## Configuration Options

### MQTT Server Configuration

MQTT servers can be configured with the following parameters:

| Parameter             | Description                                                   | Required | Default            |
| --------------------- | ------------------------------------------------------------- | -------- | ------------------ |
| Name                  | Friendly name for the server                                  | Yes      | -                  |
| Host                  | Hostname or IP address of the MQTT server                     | Yes      | -                  |
| Port                  | Port number of the MQTT server                                | Yes      | 1883               |
| Client ID             | Client identifier for the MQTT connection                     | No       | Randomly generated |
| Username              | Authentication username                                       | No       | -                  |
| Password              | Authentication password                                       | No       | -                  |
| Use TLS/SSL           | Whether to use TLS/SSL for the connection                     | No       | false              |
| Default publish QoS   | Default QoS used when publishing if not set per node (0/1/2)  | No       | 0                  |
| Default retain        | Default retain flag used when publishing if not set per node  | No       | false              |
| Default subscribe QoS | Default QoS used when subscribing if not set per node (0/1/2) | No       | 0                  |

### Resource MQTT Configuration

Each resource can have its own MQTT configuration with the following parameters:

| Parameter          | Description                                          | Required |
| ------------------ | ---------------------------------------------------- | -------- |
| MQTT Server        | The MQTT server to publish to                        | Yes      |
| In-Use Topic       | Topic template for when the resource is in use       | Yes      |
| In-Use Message     | Message template for when the resource is in use     | Yes      |
| Not-In-Use Topic   | Topic template for when the resource is not in use   | Yes      |
| Not-In-Use Message | Message template for when the resource is not in use | Yes      |

## Template Variables

## QoS and retain behavior

- Publish options can be set per node (flow editor) or defaulted per MQTT server.
- Subscribe QoS can be set on the "Wait for MQTT message" node, or defaulted per MQTT server.
- Precedence: per-node settings → server defaults → global defaults.
- Global defaults: publish QoS 0, retain false; subscribe QoS 0.
- Effective delivery QoS equals the lower of the publisher QoS and the subscriber QoS.
- Retain stores the last published message on the broker so new subscribers receive it immediately.

Both topic and message templates use Handlebars syntax and support the following variables:

| Variable        | Description                    | Example                      |
| --------------- | ------------------------------ | ---------------------------- |
| `{{id}}`        | Resource ID                    | `42`                         |
| `{{name}}`      | Resource name                  | `"3D Printer"`               |
| `{{timestamp}}` | Current timestamp (ISO format) | `"2023-05-15T14:30:00.000Z"` |
| `{{user.id}}`   | User ID (if available)         | `123`                        |
| `{{user.name}}` | User name (if available)       | `"John Doe"`                 |

### Template Examples

**Topic Templates:**

```
resources/{{id}}/status
organization/resources/{{name}}/usage
{{name}}/state
```

**Message Templates:**

```json
{"status": "in_use", "resourceId": {{id}}, "resourceName": "{{name}}", "timestamp": "{{timestamp}}"}
```

```json
{
  "resource": {
    "id": {{id}},
    "name": "{{name}}"
  },
  "status": "available",
  "lastUsed": "{{timestamp}}",
  "user": {{#if user}}"{{user.name}}"{{else}}null{{/if}}
}
```

## Handlebars Template Syntax

Handlebars provides powerful templating capabilities:

### Basic Variable Output

```
{{variableName}}
```

### Conditional Sections

```
{{#if user}}
  Used by: {{user.name}}
{{else}}
  No current user
{{/if}}
```

### Nested Properties

```
{{resource.details.location}}
```

### Escaping Values

For proper JSON formatting, numeric values should not have quotes:

```
"id": {{id}}  // Correct for numbers
"name": "{{name}}"  // Correct for strings
```

## Setting Up a Local Testing Environment

### Using the Included Docker Compose Configuration

1. Start the development environment with Mosquitto MQTT broker:

   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

2. The MQTT broker will be available at:
   - Host: `localhost`
   - Port: `1883`
   - WebSocket Port: `9001`

### Testing MQTT Messages

You can use MQTT Explorer or Mosquitto CLI tools to subscribe to topics and see messages:

```bash
# Install Mosquitto clients
brew install mosquitto  # macOS with Homebrew
apt-get install mosquitto-clients  # Debian/Ubuntu

# Subscribe to all messages
mosquitto_sub -h localhost -p 1883 -t "#" -v

# Publish a test message
mosquitto_pub -h localhost -p 1883 -t "test/topic" -m "Hello MQTT"
```

## Common Usage Scenarios

### 1. Integration with Smart Power Outlets

**Resource Configuration:**

- In-Use Topic: `power/{{id}}/command`
- In-Use Message: `{"command": "ON"}`
- Not-In-Use Topic: `power/{{id}}/command`
- Not-In-Use Message: `{"command": "OFF"}`

### 2. Status Display Integration

**Resource Configuration:**

- In-Use Topic: `displays/{{id}}/status`
- In-Use Message: `{"status": "IN_USE", "user": "{{user.name}}", "since": "{{timestamp}}"}`
- Not-In-Use Topic: `displays/{{id}}/status`
- Not-In-Use Message: `{"status": "AVAILABLE", "lastUser": "{{user.name}}", "lastUsed": "{{timestamp}}"}`

### 3. Home Assistant Integration

**Resource Configuration:**

- In-Use Topic: `homeassistant/switch/resource_{{id}}/state`
- In-Use Message: `ON`
- Not-In-Use Topic: `homeassistant/switch/resource_{{id}}/state`
- Not-In-Use Message: `OFF`

## API Endpoints

### MQTT Servers

| Method | Endpoint                 | Description                 |
| ------ | ------------------------ | --------------------------- |
| GET    | `/mqtt/servers`          | Get all MQTT servers        |
| GET    | `/mqtt/servers/:id`      | Get MQTT server by ID       |
| POST   | `/mqtt/servers`          | Create new MQTT server      |
| PUT    | `/mqtt/servers/:id`      | Update MQTT server          |
| DELETE | `/mqtt/servers/:id`      | Delete MQTT server          |
| POST   | `/mqtt/servers/:id/test` | Test MQTT server connection |

### Resource MQTT Configuration

| Method | Endpoint                                  | Description                    |
| ------ | ----------------------------------------- | ------------------------------ |
| GET    | `/resources/:resourceId/mqtt/config`      | Get MQTT config for a resource |
| POST   | `/resources/:resourceId/mqtt/config`      | Create or update MQTT config   |
| DELETE | `/resources/:resourceId/mqtt/config`      | Delete MQTT config             |
| POST   | `/resources/:resourceId/mqtt/config/test` | Test MQTT config               |

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if the MQTT server is running
   - Verify the hostname and port are correct
   - Ensure there are no firewall rules blocking the connection

2. **Authentication Failed**
   - Verify the username and password are correct
   - Check if the MQTT server requires authentication

3. **Messages Not Received**
   - Confirm the topic is correct and matches what you're subscribing to
   - Check if the MQTT broker has topic restrictions
   - Ensure the message format is valid (especially for JSON messages)

### Viewing Logs

To view detailed logs of MQTT connections and message publishing:

1. In development:

   ```
   pnpm nx serve api --verbose
   ```

2. In production, check the application logs for entries with `[MqttClientService]` prefix.

## Production Considerations

1. **Security**
   - Use TLS/SSL for all MQTT connections in production
   - Set strong, unique passwords
   - Consider using a dedicated MQTT broker with access controls

2. **Reliability**
   - Configure appropriate QoS levels based on your requirements
   - Implement monitoring for MQTT connections
   - Consider using a managed MQTT service for production

3. **Scaling**
   - For high-volume environments, consider using a clustered MQTT broker
   - Monitor message throughput and adjust accordingly

4. **Monitoring**
   - Set up alerts for MQTT connection failures
   - Monitor resource usage of your MQTT broker
   - Implement logging for successful and failed message publications
