# Flows API

This module provides CRUD operations for managing flows - visual workflow configurations that define automated actions triggered by events. A flow is either a **resource flow** (bound to one resource) or a **global flow** (a named flow that reacts to events from any resource and other sources).

## Overview

Flows consist of:

- **Nodes**: Individual workflow steps (events or actions)
- **Edges**: Connections between nodes that define the flow sequence

## API Endpoints

### Get Resource Flow

```
GET /resources/:resourceId/flows
```

Retrieves the complete flow configuration for a resource, including all nodes and edges.

### Save Resource Flow

```
PUT /resources/:resourceId/flows
```

Saves the complete flow configuration for a resource. This replaces all existing nodes and edges with the provided data.

### Delete Resource Flow

```
DELETE /resources/:resourceId/flows
```

Deletes the complete flow configuration for a resource, removing all nodes and edges.

### Shared Machine Flow Warnings

```
GET /resources/:resourceId/flow/shared-machine-warnings
```

Lists the session start, stop and takeover triggers that lead to an external effect (HTTP, MQTT, PC lock/unlock, plugin outputs) without an IF node that checks `activeSessions`. The resource settings page shows it in the "Resource type and behavior" section when the limit is raised above 1.

## Session Counts

Start, stop and takeover payloads carry `activeSessions: { before, after, limit }`, the published usage sessions around the event (supervisors do not count). On a machine with a limit above 1 these events run one at a time per machine, each from start through its flow to commit or abort; a waiter gets `MachineBusyError` after 30 s (the turn is a Valkey lock when `VALKEY_URL` is set, so it holds across API instances; a start or stop interrupted by a restart gets `SessionChangeInterruptedError`, 503; heartbeats and lock tokens carry `<host>:<port>|<boot id>`, so a restarted instance cancels its own previous run's attempts and lock at once, and the attempts of an instance that stays down are swept by the others after about 30 s; with Valkey unreachable a booting instance waits 10 s, then cleans up as the only instance; concurrent instances need distinct host:port), so a slow start or stop flow (Wait, MQTT wait, HTTP without timeout) blocks the machine. The end-session node can end the triggering session, one user's session (`target: user`, `userId` template) or all sessions (`target: all`); inside a start or stop flow those other ends are picked when the node runs and run once that start or stop has finished, before the next one, and their audit entry records the user who caused the flow run (`triggeredByUserId`, from the run's `actorUserId` option, never from the payload; none for runs without a user such as MQTT); they are dropped if it fails, unless a start flow ended its own new session.

## Node Types

### Events

- `event.resource.usage.started` - Triggered when resource usage begins
- `event.resource.usage.ended` - Triggered when resource usage ends
- `event.resource.usage.takeover` - Triggered when resource usage is taken over

### Actions

- `action.http.sendRequest` - Send HTTP request
- `action.mqtt.sendMessage` - Send MQTT message
- `action.util.wait` - Wait for specified duration

## Request/Response Format

### Save Flow Request

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "event.resource.usage.started",
      "position": { "x": 100, "y": 100 },
      "data": {}
    },
    {
      "id": "node-2",
      "type": "action.http.sendRequest",
      "position": { "x": 300, "y": 100 },
      "data": {
        "url": "https://example.com/webhook",
        "method": "POST",
        "headers": { "Content-Type": "application/json" }
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2"
    }
  ]
}
```

### Response Format

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "event.resource.usage.started",
      "position": { "x": 100, "y": 100 },
      "data": {},
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "createdAt": "2023-01-01T00:00:00Z",
      "updatedAt": "2023-01-01T00:00:00Z"
    }
  ]
}
```

## Global Flows

Global flows are named flows not tied to a resource. They use the same canvas, payloads and execution engine as resource flows.

### Endpoints

All `/flows` endpoints require `resources.update`.

- `GET /flows`, `POST /flows`, `GET|PATCH|DELETE /flows/:flowId` - CRUD of global flows (name, optional description, `enabled`, default `true`)
- `GET|PUT /flows/:flowId/canvas` - read and save the nodes and edges of a flow
- `GET /flows/node-schemas` - node schemas including plugin nodes; each carries `supportedFlowScopes: ('resource' | 'global')[]` (`supportedByResource` stays and applies to resource flows only)
- resolve/preview of dynamic node schemas, logs, recording and live SSE, mirroring the resource flow endpoints

### Data Model

Global flows live in the `flow` table (name, description, enabled). `resource_flow_node` and `resource_flow_edge` now have a nullable `resourceId` and a nullable `flowId`. **Exactly one** of the two must be set: a node or edge belongs either to a resource flow or to a global flow (check constraint). Both foreign keys cascade on delete.

### Node Scopes

Every node declares `flowScopes` (`'resource'`, `'global'` or both). The resource-only core nodes are `input.button`, `input.resource.metering.start`, `input.resource.metering.collect`, `output.resource.metering.ready` and `output.resource.metering.report`; all other core nodes support both. Saving or importing a flow with an unsupported node fails validation and names the node. Plugin nodes default to resource-only until the plugin sets `flowScopes`. `resolveConfigSchema` receives `{ flowScope, resourceId, flowId, purpose? }`; `resourceId` is `null` in global flows. `supportedByAllResources` filters resource flows only.

### Execution Semantics

- A disabled flow never runs: no trigger matches, no-activity is skipped and MQTT topics are not needed. Disabling during a run lets that run finish.
- A trigger in a global flow fires once per matching event for any resource of the right type. The new triggers `input.resource.health.changed`, `input.resource.maintenance.created`, `input.resource.maintenance.finished` and `input.resource.maintenance-request.created` exist in both flow types. Health fires only on a real status change.
- For usage start/stop/takeover and door events the matching trigger nodes of enabled global flows run in the **same run** as the resource's own flow: same transaction, same per-machine session-change turn, concurrent with the resource flow and awaited together. A failing global node (failure behavior `fail-flow`, or an error) therefore aborts and rolls back the start, stop or takeover, and a slow global flow delays it. All other triggers (health, maintenance, MQTT, Companion, variables, plugin, no activity) run as in resource flows.
- No activity checks every minute with each node's `minInactivityMinutes`; global and resource nodes keep independent schedules per (node, resource).
- Variable changed: `global` scope fires on that global variable; `resource` scope fires when the key changes on any resource, which becomes the triggering resource. A flow that sets the variable it watches can loop, as in resource flows.
- `context.flows.trigger(...)` from plugins also matches the plugin's trigger nodes in enabled global flows with the same `matches` callback.

### Triggering Resource

For resource events the payload contains `resource: { id, name, type, metadata }`. Triggers that are not resource events (MQTT, Companion, global-scope variable change, plugin triggers) have no triggering resource: the payload has no `resource` key. Nodes that act on a resource (end session, billing additional items, activity track, operating/idle, health heartbeat/set, `resource`-scope variable get/set) fail as a normal node error when the run has no triggering resource or the resource has the wrong type.

### Shared Machine Warnings

The shared-machine warning also lists enabled global flows, labelled with the flow's name and linking to `/devices/flows/:flowId`.

## Authentication

All endpoints require the `resources.update` permission.

## Database Schema

Resource flows and global flows share two node/edge tables:

- `resource_flow_node` - Stores individual flow nodes
- `resource_flow_edge` - Stores connections between nodes

Both tables have foreign keys to the `resource` table (resource flows) and to the `flow` table (global flows), each with CASCADE delete; exactly one owner is set per row.
