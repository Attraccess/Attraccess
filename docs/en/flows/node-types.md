# Node Types

Flows are built from three categories of nodes: **Input** (triggers), **Processing** (logic), and **Output** (actions). This page describes every available node type and its configuration.

## Input Nodes (Triggers)

Input nodes start a flow when a specific event occurs. Every flow needs at least one input node.

### Button

A manual trigger. Adds a button to the resource detail page that users can click to run the flow.

| Setting | Description |
|---------|-------------|
| **Label** | Text displayed on the button |

### Resource Usage Started

Triggers when a user starts a usage session on the resource.

No additional settings.

### Resource Usage Stopped

Triggers when a user ends a usage session on the resource.

No additional settings.

### Resource Usage Takeover

Triggers when a user takes over an active usage session from another user.

No additional settings.

### Door Unlocked

Triggers when a door resource is unlocked.

No additional settings.

### Door Locked

Triggers when a door resource is locked.

No additional settings.

### Door Unlatched

Triggers when a door resource is unlatched (briefly opened).

No additional settings.

### MQTT Message Received

Triggers when a message is received on a specific MQTT topic.

| Setting | Description |
|---------|-------------|
| **Topic** | The MQTT topic to listen on (e.g. `workshop/laser/status`) |

> [!TIP]
> The received MQTT message payload is available to downstream nodes as input data. You can use **Set Payload** or **If** nodes to work with it.

### No Activity

Triggers after a period of inactivity on the resource. Useful for safety automations such as automatic shutdown.

| Setting | Description |
|---------|-------------|
| **Timeout** | Duration of inactivity before triggering |
| **Unit** | Seconds, Minutes, or Hours |

---

## Processing Nodes

Processing nodes control the flow of data between input and output nodes.

### Wait

Pauses the flow for a specified duration before continuing.

| Setting | Description |
|---------|-------------|
| **Duration** | How long to wait |
| **Unit** | Seconds, Minutes, or Hours |

### If

Conditional branching. Evaluates a comparison and routes the flow to different paths.

| Setting | Description |
|---------|-------------|
| **Left Value** | First value to compare |
| **Operator** | Comparison operator (equals, not equals, greater than, less than, etc.) |
| **Right Value** | Second value to compare |

The node has two outputs:

- **True** -- The condition matched
- **False** -- The condition did not match

### Set Payload

Sets or modifies variables that are passed to downstream nodes.

| Setting | Description |
|---------|-------------|
| **Key** | Variable name |
| **Value** | Variable value |

> [!NOTE]
> You can chain multiple Set Payload nodes to build up complex data for an output node.

### Wait for MQTT Message

Pauses the flow until a specific MQTT message is received, or until a timeout expires.

| Setting | Description |
|---------|-------------|
| **Topic** | The MQTT topic to listen on |
| **Timeout** | Maximum time to wait |
| **Unit** | Seconds, Minutes, or Hours |

The node has two outputs:

- **Message Received** -- A message arrived before the timeout
- **Timeout** -- No message was received in time

### Error

Triggers the flow's error handling. Use this to stop a flow and flag a problem.

| Setting | Description |
|---------|-------------|
| **Message** | Error message to display |

---

## Output Nodes (Actions)

Output nodes perform actions when reached. They are typically at the end of a flow.

### HTTP Request

Sends an HTTP request to an external URL. Useful for webhooks and API integrations.

| Setting | Description |
|---------|-------------|
| **Method** | GET, POST, PUT, PATCH, or DELETE |
| **URL** | The target URL |
| **Headers** | Optional HTTP headers (key-value pairs) |
| **Body** | Optional request body (for POST/PUT/PATCH) |

### MQTT Send Message

Publishes a message to an MQTT topic.

| Setting | Description |
|---------|-------------|
| **Topic** | The MQTT topic to publish to |
| **Payload** | The message content |

### Set Billing Items

Sets billing items for the current usage session. Used for automated cost tracking.

| Setting | Description |
|---------|-------------|
| **Items** | List of billing items with name, quantity, and price |

> [!NOTE]
> This node only works when the flow is triggered by a usage-related event (usage started, stopped, or takeover).

### End Usage Session

Ends the current usage session on the resource. Useful for automatic shutdown flows.

No additional settings.

### Track Activity

Records an activity event on the resource. Resets the inactivity timer for **No Activity** trigger nodes.

No additional settings.

## See Also

- [Flow Editor](flows/flow-editor.md) -- How to place and connect nodes
- [Flows Overview](flows/overview.md) -- What flows are and how they work
- [MQTT & IoT](devices/mqtt/overview.md) -- Setting up MQTT
- [Billing](billing/overview.md) -- Billing system details
