# MQTT Examples

This page shows practical examples of how to use MQTT with Attraccess to control machines, receive sensor data, and automate your makerspace.

> [!NOTE]
> All examples assume you have already [connected an MQTT broker](devices/mqtt/server-setup.md) and are familiar with the basics of [Flows](flows/overview.md).

## Example 1: Machine Power Control via MQTT Relay

**Goal:** Automatically turn a machine on when a user starts using it, and turn it off when they stop.

### What You Need

- A smart relay or switchable power socket connected to your MQTT broker
- The relay listens on a topic like `workshop/laser/power`

### Flow Setup

Create a flow on the laser cutter resource with two paths:

**Power On:**

1. Add an **Input** node: **Usage Started**
2. Connect it to an **Output** node: **MQTT Send Message**
3. Configure the MQTT node:

| Setting | Value |
|---------|-------|
| **Server** | Your MQTT broker |
| **Topic** | `workshop/laser/power` |
| **Payload** | `ON` |

**Power Off:**

1. Add an **Input** node: **Usage Ended**
2. Connect it to an **Output** node: **MQTT Send Message**
3. Configure the MQTT node:

| Setting | Value |
|---------|-------|
| **Server** | Your MQTT broker |
| **Topic** | `workshop/laser/power` |
| **Payload** | `OFF` |

<!-- TODO: Screenshot of the power control flow in the editor -->

> [!TIP]
> Many smart relays (Shelly, Sonoff, Tasmota) support MQTT out of the box. Check your device's documentation for the correct topic and payload format.

---

## Example 2: Receive Sensor Data from a Machine

**Goal:** Monitor temperature data from a 3D printer and display it in Attraccess.

### What You Need

- A temperature sensor connected to your MQTT broker
- The sensor publishes data to a topic like `workshop/3dprinter/temperature`

### Flow Setup

1. Add an **Input** node: **MQTT Message Received**
2. Configure the MQTT node:

| Setting | Value |
|---------|-------|
| **Server** | Your MQTT broker |
| **Topic** | `workshop/3dprinter/temperature` |

3. Connect it to a **Processing** node (e.g. **If** condition) to check if the temperature exceeds a threshold
4. Connect the condition to an **Output** node (e.g. **HTTP Request** to send a notification)

### Example: Temperature Alert

| Node | Configuration |
|------|--------------|
| **MQTT Message Received** | Topic: `workshop/3dprinter/temperature` |
| **If Condition** | `payload.value > 250` |
| **HTTP Request** | Send alert to your notification service |

<!-- TODO: Screenshot of the sensor monitoring flow -->

> [!NOTE]
> The exact payload format depends on your sensor. Common formats are plain numbers (`42.5`) or JSON (`{"value": 42.5, "unit": "celsius"}`).

---

## Example 3: Use MQTT in Flows for Resource Usage Events

**Goal:** Send MQTT messages to multiple devices when a resource usage session starts or stops -- for example, turning on a machine, activating dust extraction, and switching on room lighting.

### What You Need

- Multiple MQTT-capable devices connected to your broker
- Each device listens on its own topic

### Flow Setup

1. Add an **Input** node: **Usage Started**
2. Connect it to multiple **Output** nodes (MQTT Publish), one for each device:

| Device | Topic | Payload |
|--------|-------|---------|
| Laser Cutter | `workshop/laser/power` | `ON` |
| Dust Extraction | `workshop/extraction/power` | `ON` |
| Room Light | `workshop/lights/zone3` | `ON` |

3. Repeat with a **Usage Ended** input connected to the same topics with `OFF` payloads

<!-- TODO: Screenshot of the multi-device flow -->

> [!TIP]
> You can add a **Wait** node between the machine power-on and the dust extraction to give the machine time to start up before activating extraction.

## Combining MQTT with Other Nodes

MQTT nodes can be freely combined with other flow nodes for more advanced scenarios:

- **Wait** -- Add a delay before sending an MQTT message
- **If Condition** -- Only send a message when certain conditions are met
- **Set Payload** -- Transform data before publishing to MQTT
- **HTTP Request** -- Combine MQTT with web service calls

See [Node Types](flows/node-types.md) for a complete list of available nodes.

## See Also

- [Overview](devices/mqtt/overview.md) -- What is MQTT?
- [Server Setup](devices/mqtt/server-setup.md) -- Connect Attraccess to an MQTT broker
- [Flows & Automation](flows/overview.md) -- Create automation workflows
- [Flow Editor](flows/flow-editor.md) -- How to use the visual editor
- [Node Types](flows/node-types.md) -- All available node types
