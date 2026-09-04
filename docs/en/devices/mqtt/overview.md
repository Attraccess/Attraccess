# MQTT & IoT

MQTT is a lightweight messaging protocol widely used in IoT (Internet of Things) applications. Attraccess can connect to MQTT brokers to communicate with machines, sensors, and other devices in your makerspace.

## What is MQTT?

MQTT (Message Queuing Telemetry Transport) is a protocol designed for sending and receiving small messages between devices. It works on a publish/subscribe model:

- **Publish** -- A device sends a message to a topic (e.g. `workshop/laser/power`)
- **Subscribe** -- A device listens for messages on a topic
- **Broker** -- A server that routes messages between publishers and subscribers

## Why Use MQTT with Attraccess?

MQTT allows Attraccess to interact with physical hardware in your makerspace:

| Use Case | Description |
|----------|-------------|
| **Machine Control** | Turn machines on/off when a user starts or ends a usage session |
| **Sensor Monitoring** | Receive data from sensors (temperature, power consumption, etc.) |
| **Safety Systems** | Monitor emergency stop buttons or door sensors |
| **Automation** | Trigger actions based on machine states or user activity |

<!-- TODO: Screenshot of MQTT integration in Attraccess -->

## How It Works in Attraccess

1. You connect Attraccess to an MQTT broker (see [Server Setup](devices/mqtt/server-setup.md))
2. You create [Flows](flows/overview.md) that use MQTT nodes to send or receive messages
3. When a flow triggers, Attraccess publishes or subscribes to MQTT topics
4. Your machines and devices respond to (or send) these messages

> [!NOTE]
> Attraccess does not include a built-in MQTT broker. You need to run a separate broker such as Mosquitto, RabbitMQ, or HiveMQ.

## Integration with Flows

MQTT is deeply integrated with the [Flow system](flows/overview.md). You can use MQTT nodes in flows to:

- **Send messages** when a resource usage starts or stops
- **Receive messages** from devices and use them as flow triggers
- **Combine** MQTT with other flow nodes (conditions, delays, HTTP requests)

> [!TIP]
> Start with a simple setup -- connect a smart relay to your MQTT broker and create a flow that turns it on when a user starts using a machine.

## Getting Started

1. Set up an MQTT broker (or use an existing one)
2. [Connect Attraccess to the broker](devices/mqtt/server-setup.md)
3. Create flows that use MQTT nodes
4. Connect your machines and sensors to the same broker

## See Also

- [Server Setup](devices/mqtt/server-setup.md) -- Connect Attraccess to an MQTT broker
- [Examples](devices/mqtt/examples.md) -- Practical MQTT integration examples
- [Flows & Automation](flows/overview.md) -- Create automation workflows
- [Node Types](flows/node-types.md) -- All available flow nodes including MQTT
