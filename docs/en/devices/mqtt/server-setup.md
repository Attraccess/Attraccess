# MQTT Server Setup

This guide explains how to connect Attraccess to an MQTT broker so you can use MQTT in your automation flows.

## Prerequisites

Before you begin, you need:

- A running MQTT broker (see [Common Brokers](#common-brokers) below)
- The broker's hostname, port, and credentials
- Administrator permissions in Attraccess

## Adding an MQTT Server

1. Open the **Devices** group in the sidebar
2. Click on **MQTT Servers**
3. Click **Add Server**
4. Enter the connection details:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | A descriptive name for this connection | `Workshop Broker` |
| **Host** | Hostname or IP address of the MQTT broker | `mqtt.example.com` |
| **Port** | MQTT port | `1883` (default) or `8883` (TLS) |
| **Username** | Login username (if required) | `attraccess` |
| **Password** | Login password (if required) | |
| **Use TLS** | Enable encrypted connection | Recommended for production |

5. Click **Save**

<!-- TODO: Screenshot of the Add MQTT Server dialog -->

## Testing the Connection

After adding a server, you can test whether Attraccess can connect:

1. Open the server you just created
2. Click **Test Connection**
3. Attraccess attempts to connect to the broker and reports success or failure

> [!NOTE]
> If the connection test fails, check that the hostname, port, and credentials are correct. Also verify that your firewall allows traffic on the MQTT port.

## Common Brokers

Here are some popular MQTT brokers you can use with Attraccess:

| Broker | Description | Default Port |
|--------|-------------|-------------|
| **Mosquitto** | Lightweight, open-source broker. Easy to set up with Docker | `1883` |
| **RabbitMQ** | Full-featured message broker with MQTT plugin | `1883` |
| **HiveMQ** | Enterprise MQTT broker with a free community edition | `1883` |

### Mosquitto with Docker

The easiest way to run an MQTT broker is with Mosquitto in Docker:

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
> If you are already running Attraccess with Docker Compose, you can add the Mosquitto service to the same `docker-compose.yml` file.

### RabbitMQ with MQTT Plugin

If you already use RabbitMQ, enable the MQTT plugin:

```bash
rabbitmq-plugins enable rabbitmq_mqtt
```

RabbitMQ then accepts MQTT connections on port `1883` by default.

## Multiple Servers

You can connect Attraccess to multiple MQTT brokers. This is useful when:

- Different machines use different brokers
- You have separate brokers for production and testing
- Different areas of your makerspace use separate networks

## Connection Status

The Servers page shows the current connection status for each broker:

| Status | Description |
|--------|-------------|
| **Connected** | Attraccess is connected to the broker |
| **Disconnected** | No active connection -- check configuration or broker availability |
| **Connecting** | Attraccess is attempting to connect |
| **Error** | Connection failed -- see error details for more information |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Connection refused | Verify the host and port are correct. Check that the broker is running |
| Authentication failed | Double-check the username and password |
| Timeout | Ensure the broker is reachable from the Attraccess server (check firewalls) |
| TLS errors | Verify your TLS configuration and certificates |

## See Also

- [Overview](devices/mqtt/overview.md) -- What is MQTT?
- [Examples](devices/mqtt/examples.md) -- Practical MQTT integration examples
- [Flows & Automation](flows/overview.md) -- Create automation workflows
- [Environment Variables](installation/environment-variables.md) -- Server configuration
