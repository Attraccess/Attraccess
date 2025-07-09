# Resource Flows API

This module provides CRUD operations for managing resource flows - visual workflow configurations that define automated actions triggered by resource events.

## Overview

Resource flows consist of:

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

## Authentication

All endpoints require the `canManageResources` permission.

## Database Schema

The flows are stored in two tables:

- `resource_flow_node` - Stores individual flow nodes
- `resource_flow_edge` - Stores connections between nodes

Both tables have foreign key relationships to the `resource` table with CASCADE delete.
