# Global Flows

A global flow is a named flow that is not tied to one resource. It reacts to events from **any** resource and to other sources such as MQTT, Companion, variables and plugins. Use it for rules that should apply everywhere instead of rebuilding the same flow on every resource -- for example, send a webhook or MQTT notification whenever any machine starts, any door unlocks, any resource becomes unhealthy, or a maintenance request comes in.

Global flows use the same [Flow Editor](flows/flow-editor.md), the same [payloads](flows/payloads-variables-templates.md) and the same execution engine as resource flows.

## Where to Find Global Flows

Open **Devices** → **Flows** in the sidebar (`/devices/flows`). You need the `resources.update` permission, which administrators have by default.

The list shows each global flow with its name, an on/off switch, the number of nodes, and buttons to open it in the editor, to change its name and description, or to delete it (deleting asks for confirmation). **New flow** opens a dialog for a name and an optional description. You can change both later with the details button in the list or in the editor header.

Each flow opens in its own editor at `/devices/flows/:flowId`. The editor shows the flow's name and on/off switch above the canvas, together with this note: _Runs for every resource; a failing or slow global flow affects starts and stops on all machines._

## Properties of a Global Flow

| Property        | Description                                                |
| --------------- | ---------------------------------------------------------- |
| **Name**        | Required name shown in the list and the editor             |
| **Description** | Optional free text                                         |
| **Enabled**     | On by default. A disabled flow never runs                  |
| Canvas          | Its own nodes and connections, edited like a resource flow |

You can create as many global flows as you need.

A disabled flow never runs: none of its triggers match and its no-activity nodes are skipped. Its MQTT topics are not subscribed when the server starts. Subscriptions that already exist stay until the next restart when you disable or delete the flow, but incoming messages do not start it. Turning a flow off while a run is in progress lets that run finish.

## Available Nodes

Every node declares whether it can be used in resource flows, in global flows, or in both.

- These core nodes work in **resource flows only**: Button, Metering Start, Metering Collection, Metering Ready and Report Meter.
- All other core nodes work in both.
- The node palette only shows nodes that support the current flow type.
- Saving or importing a global flow that contains an unsupported node fails with a validation error that names the node.
- Plugin nodes are resource-only until the plugin opts in. See [Developing Plugins](plugins/developing-plugins.md#flow-nodes).

See [Node Types](flows/node-types.md) for the full list.

## Triggers in Global Flows

A trigger in a global flow fires **once per matching event**, for any resource of the right type:

| Trigger                                                    | Fires for                                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Usage started, stopped, takeover                           | Every machine                                                                                                     |
| Door locked, unlocked, unlatched                           | Every door                                                                                                        |
| No activity                                                | Every machine with an active session, checked once per minute against the node's **Minimum inactivity (minutes)** |
| Health changed                                             | Every resource, on a real status change                                                                           |
| Maintenance created, finished, maintenance request created | Every resource                                                                                                    |
| MQTT message received                                      | Matching topic and server, as in resource flows                                                                   |
| Companion inputs                                           | The selected Companion device                                                                                     |
| Variable changed                                           | See below                                                                                                         |
| Plugin trigger nodes (for example WAGO event received)     | Whatever the plugin reports                                                                                       |

Details worth knowing:

- **No activity:** every no-activity node keeps its own schedule per machine. A 5-minute node fires after 5, 10, 15 … minutes of inactivity, a 10-minute node after 10, 20 … minutes. Global nodes and nodes in the resource's own flow do not affect each other. See [No Activity](flows/node-types.md#no-activity).
- **Maintenance request created:** any signed-in user can create a maintenance request for a resource, and so fire this trigger. Only connect it to actions you would let any user cause.
- **Variable changed:** with the `global` scope the flow fires when that global variable changes. With the `resource` scope it fires when that key changes on **any** resource, and that resource becomes the triggering resource.

## The Triggering Resource

When a resource event starts a global flow, the payload contains the resource that caused it:

```json
{
  "resource": { "id": 12, "name": "Laser Cutter", "type": "machine", "metadata": {} }
}
```

Use this to find out which resource fired. To react only to some resources, add an **If** node after the trigger and compare the path `resource.id` or `resource.type` with a value.

Triggers that are not resource events have **no triggering resource**, and the payload has no `resource` key at all. This applies to MQTT messages, Companion inputs, global-scope variable changes and plugin triggers.

Nodes that act on a resource -- End active session, Add billing item, Record activity, Record operation started/stopped, Send health heartbeat, Set health state, and `resource`-scope Get variables and Set variables -- fail as a normal node error when the run has no triggering resource, or when the triggering resource has the wrong type (for example End active session for a door). The node's usual failure behavior applies. **End active session** with the target **The triggering session** ends the triggering session.

**Send health heartbeat** in a global flow only watches resources that have sent at least one heartbeat through that node since the server started. After a restart, a resource that never sends another heartbeat is not marked unhealthy. Heartbeat nodes in global flows and in resource flows are tracked separately; a heartbeat from one does not reset the timeout of the other.

## Execution and Blocking

> [!WARNING]
> Global flows run **inside** starts, stops and takeovers. A failing or slow global flow affects every machine.

For usage started, stopped and takeover, and for door events, the matching trigger nodes of all enabled global flows run in the **same run** as the resource's own flow:

- same transaction and the same per-machine session-change turn
- concurrently with the resource's own flow, and awaited together

This has the same consequences as a node in the machine's own flow:

- A global node with failure behavior **Fail flow**, or an error without a failure output, aborts and rolls back the start, stop or takeover.
- A slow global flow (Wait, Send HTTP request without a timeout, Wait for MQTT message) delays the start or stop on every machine.

Set the failure behavior of external actions in global flows deliberately, for example **Log and continue** for notifications. See [Failure behavior](flows/node-types.md#failure-behavior).

All other triggers (health, maintenance, MQTT, Companion, variables, plugins, no activity) run as they do in resource flows.

### Feedback Loops

- A global flow triggered by **Health changed** that sets the health again fires only on a real status change, so it does not loop.
- A **Variable changed** flow that sets the same variable it watches can loop, exactly as in resource flows. See [persistent variables](flows/payloads-variables-templates.md#persistent-flow-variables) for loop prevention.

### Shared-Machine Warnings

The warning on the resource settings page for machines that allow several simultaneous sessions also lists enabled global flows. It reports flows whose start, stop or takeover triggers reach an effect node without an `activeSessions` check. Global flows appear with their name and link to `/devices/flows/:flowId`.

## Example: Webhook on Every Session Start

Send an HTTP webhook whenever anybody starts using any machine.

1. Open **Devices** → **Flows** and click **New flow**.
2. Enter the name `Notify on starts`, add a description if you like, and confirm. The editor opens.
3. Add a **Usage started** trigger from the palette.
4. Add a **Send HTTP request** node, set the URL and use templates such as `{{resource.name}}` and `{{user.username}}` in the body. Set its failure behavior to **Log and continue**, so an unreachable webhook does not block starts.
5. Connect **Output** of the trigger to **Send HTTP request**.
6. Optional: put an **If** node in between with path `resource.id` to notify for one machine only.
7. Click **Save**. The flow is enabled by default and runs at the next start.

## See Also

- [Flows & Automation](flows/overview.md) -- Introduction to flows
- [Flow Editor](flows/flow-editor.md) -- How to use the visual editor
- [Node Types](flows/node-types.md) -- All available node types
- [Payloads, Variables & Templates](flows/payloads-variables-templates.md) -- Work with node data
