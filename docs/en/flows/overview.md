# Flows & Automation

Flows are visual automation workflows that you can attach to any resource. They let you automate actions when something happens -- for example, sending an MQTT message when a machine is turned on, or triggering billing when a session ends.

## What is a Flow?

A flow is a chain of connected nodes on a visual canvas. Each flow belongs to a specific resource and is built from three types of nodes:

| Node Category | Purpose | Examples |
|---------------|---------|----------|
| **Input (Trigger)** | Starts the flow when an event occurs | Button press, usage started, MQTT message received |
| **Processing** | Transforms data or controls the flow | Wait, If (condition), Set Payload |
| **Output (Action)** | Performs an action | HTTP request, MQTT message, Set Billing Items |

> [!NOTE]
> A flow always starts with at least one **Input** node and typically ends with one or more **Output** nodes.

## How Flows Work

1. An **event** occurs (e.g. a user starts using a resource)
2. The matching **Input node** fires
3. Data passes through any **Processing nodes** (delays, conditions, variable assignments)
4. One or more **Output nodes** perform the final action (e.g. send an HTTP request)

<!-- TODO: Screenshot of a simple example flow -->

## Use Cases

Here are some common examples:

- **Machine control** -- Send an MQTT message to power on a machine when usage starts, and power it off when usage ends
- **Billing** -- Automatically set billing items based on form data when a session ends
- **Notifications** -- Send an HTTP webhook to Slack or email when a resource is unlocked
- **Safety** -- End a usage session automatically after a period of inactivity

## Creating Your First Flow

1. Open the [detail page](resources/resource-details.md) of a resource
2. Go to the **Flows** tab
3. Click **Create Flow**
4. Use the [Flow Editor](flows/flow-editor.md) to add and connect nodes

> [!TIP]
> Start simple -- try a **Button** trigger connected to an **HTTP Request** output to test your setup before building complex automations.

## See Also

- [Flow Editor](flows/flow-editor.md) -- How to use the visual editor
- [Node Types](flows/node-types.md) -- All available node types
- [MQTT & IoT](devices/mqtt/overview.md) -- Connect your hardware
- [Billing](billing/overview.md) -- Automate cost tracking
