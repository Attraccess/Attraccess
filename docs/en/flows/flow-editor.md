# Flow Editor

The Flow Editor is a visual drag-and-drop tool for building automation workflows. It is accessible from the **Flows** tab on any resource detail page.

## Opening the Editor

1. Navigate to a resource's [detail page](resources/resource-details.md)
2. Click the **Flows** tab
3. Click on an existing flow to edit it, or click **Create Flow** to start a new one

<!-- TODO: Screenshot of the Flow Editor -->

## Editor Overview

The editor consists of:

- **Canvas** -- The main area where you build your flow by placing and connecting nodes
- **Node Palette** -- A panel listing all available node types, organized by category
- **Execution Logs** -- A panel showing real-time execution status

## Adding Nodes

1. Find the desired node in the **Node Palette** on the left
2. Drag the node onto the canvas
3. The node appears with its configuration options

> [!TIP]
> You can also double-click a node in the palette to add it to the canvas automatically.

## Connecting Nodes

Nodes have **handles** (small circles) on their edges:

- **Output handles** are on the right side of a node
- **Input handles** are on the left side of a node

To connect two nodes:

1. Click and hold on an **output handle** of the source node
2. Drag the connection line to an **input handle** of the target node
3. Release to create the connection

> [!NOTE]
> Not all node combinations are valid. The editor will prevent invalid connections (e.g. connecting two input nodes directly).

## Configuring Nodes

Click on any node to open its settings panel. Each node type has its own configuration options -- see [Node Types](flows/node-types.md) for details.

## Metered Billing

For usage-based electricity billing, read a cumulative energy counter before
enabling the load and store that reading with the usage ID in a resource variable.
When ending the session, disable the load first and obtain a newer final reading.
Check availability, unit, counter continuity and usage ID before calculating a charge.

Set **Require flow success** on the usage start/stop triggers when these checks
are mandatory. A failed required branch aborts that usage operation; errors in
other, optional branches keep their existing behavior. If the load was already
switched off, a failed billing check keeps the session open for an explicit retry.

Payload and variable templates support these helpers:

| Helper | Meaning |
| --- | --- |
| `subtract a b` | Exact difference of safe integers |
| `divide a b` | Division of safe integers, useful for a human-readable quantity |
| `roundRatio value multiplier divisor` | Exact integer multiplication/division, rounded half away from zero |
| `timestamp value` | Convert an ISO timestamp or Date to epoch milliseconds |
| `now` | Current server time in epoch milliseconds |
| `json value` | Preserve structured data as JSON |

Missing, nonnumeric, fractional integer inputs, zero divisors, and unsafe integer
results produce errors. For example, with cumulative readings in milliwatt-hours,
this calculates a charge at 30 cents/kWh:

```handlebars
{{roundRatio (subtract wago.value energyBaseline.reading.value) energyBaseline.rateCentsPerKwh 1000000}}
```

Use an **Add billing item** node with quantity `1` and **Use calculated unit price**
enabled. It requires `input.unitPrice` in integer currency minor units (cents for
EUR), including a valid zero. Put the measured kWh and captured rate in
`input.externalReference` so they appear alongside the billing item. Without the
option, the node continues to use its configured unit price.

## Auto-Layout

Click the **Auto-Layout** button in the toolbar to automatically arrange all nodes in a clean, readable layout. This is useful after adding many nodes or when the canvas becomes cluttered.

## Import & Export

You can share flows between resources or back them up:

| Action | How |
|--------|-----|
| **Export** | Click the **Export** button to download the flow as a JSON file |
| **Import** | Click the **Import** button and select a previously exported JSON file |

> [!NOTE]
> Imported flows may need adjustment if the target resource has different settings than the source.

## Execution Logs

The execution log panel shows real-time status for each node as the flow runs. Node colors indicate their current state:

| Color | Status |
|-------|--------|
| **Gray** | Idle -- not yet executed |
| **Blue** | Processing -- currently running |
| **Green** | Completed -- finished successfully |
| **Red** | Failed -- an error occurred |

<!-- TODO: Screenshot of execution logs with color indicators -->

## Saving Your Flow

Click **Save** in the toolbar to save your changes. The flow will be active immediately and will trigger whenever its input conditions are met.

## See Also

- [Node Types](flows/node-types.md) -- All available nodes and their settings
- [Flows Overview](flows/overview.md) -- What flows are and how they work
