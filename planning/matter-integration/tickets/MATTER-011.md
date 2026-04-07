# MATTER-011: Matter Event Flow Node — Backend

**Priority:** P0 — Flow Integration
**Dependencies:** MATTER-002 (profiles), MATTER-009 (subscriptions emit events)
**Parallel with:** MATTER-012
**Estimated scope:** ~200 lines across 3 files

---

## Goal

Add a new flow input node `input.matter.event` that triggers a flow when a Matter device state changes. Users select a device, an event type (e.g., "Lock State Changed"), and optionally a filter value (e.g., "Locked").

---

## Context for the Agent

### How flow node types are defined
**File:** `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

Node types are defined in the `ResourceFlowNodeType` enum. Each type has a Zod schema for its configuration data. The schema uses `.meta()` for frontend hints like `selectFromEntity`.

```typescript
export enum ResourceFlowNodeType {
  INPUT_BUTTON = 'input.button',
  // ... existing types ...
  // ADD: INPUT_MATTER_EVENT = 'input.matter.event',
}

// Example schema with entity select:
const MqttServerIdSchema = z.number().int().positive().meta({
  selectFromEntity: 'mqttServer',
  entityProperty: 'id',
});
```

### How `getNodeDataSchema()` works
**File:** `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

```typescript
export function getNodeDataSchema(type: ResourceFlowNodeType) {
  switch (type) {
    case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
      return MqttMessageReceivedNodeDataSchema;
    // ADD: case for INPUT_MATTER_EVENT
    default:
      return NodeWithoutDataSchema;
  }
}
```

### How `getNodeSchemas()` registers node UI metadata
**File:** `apps/api/src/resources/flows/resource-flows.service.ts` (~line 310)

```typescript
case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
  schema.configSchema = z.toJSONSchema(MqttMessageReceivedNodeDataSchema);
  schema.outputs = ['output'];
  schema.supportedByResource = true;
  break;
// ADD: case for INPUT_MATTER_EVENT
```

### How the flow executor handles input nodes
**File:** `apps/api/src/resources/flows/resource-flows-executor.service.ts` (~line 540)

Input nodes pass through their input payload:
```typescript
case ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED:
  responseOfNode = { payload: input };
  break;
// ADD: case for INPUT_MATTER_EVENT
```

### How the executor listens for events
In the same file, there's an `@OnEvent` handler for MQTT messages that finds matching flow nodes and starts flows. Follow the same pattern for Matter events.

```typescript
@OnEvent('mqtt.message.received')
async handleMqttMessage(event: MqttMessageReceivedEvent) {
  const nodes = await this.flowNodeRepository.find({
    where: { type: ResourceFlowNodeType.INPUT_MQTT_MESSAGE_RECEIVED },
    relations: ['resource'],
  });
  for (const node of matchingNodes) {
    await this.startFlow(node.resourceId, node, event.payload);
  }
}
```

### Event from MATTER-009
The subscription manager emits:
```typescript
eventEmitter.emit('matter.device.stateChange', {
  deviceId, deviceName, deviceType,
  eventKey, eventLabel, value, humanValue,
  previousValue, previousHumanValue, timestamp,
});
```

---

## Specification

### 1. Add enum value

**File:** `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

Add to `ResourceFlowNodeType` enum:
```typescript
INPUT_MATTER_EVENT = 'input.matter.event',
```

### 2. Define Zod schema

**File:** `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

```typescript
export const MatterEventNodeDataSchema = z.object({
  deviceId: z.number().int().positive().meta({
    selectFromEntity: 'matterDevice',
    entityProperty: 'id',
  }),
  eventKey: z.string().min(1).meta({
    selectFromEntity: 'matterDeviceEvent',
    entityProperty: 'key',
    dependsOn: 'deviceId',
  }),
  filterValue: z.string().optional().meta({
    selectFromEntity: 'matterDeviceEventFilterValue',
    entityProperty: 'value',
    dependsOn: 'eventKey',
    helpText: 'Only trigger when value matches (leave empty to trigger on any change)',
  }),
});
```

### 3. Register schema in `getNodeDataSchema()`

Add case:
```typescript
case ResourceFlowNodeType.INPUT_MATTER_EVENT:
  return MatterEventNodeDataSchema;
```

### 4. Register in `getNodeSchemas()`

**File:** `apps/api/src/resources/flows/resource-flows.service.ts`

```typescript
case ResourceFlowNodeType.INPUT_MATTER_EVENT:
  schema.configSchema = z.toJSONSchema(MatterEventNodeDataSchema);
  schema.outputs = ['output'];
  schema.supportedByResource = true; // all resource types
  break;
```

### 5. Add to executor switch statement

**File:** `apps/api/src/resources/flows/resource-flows-executor.service.ts`

In `processNode()` switch:
```typescript
case ResourceFlowNodeType.INPUT_MATTER_EVENT:
  responseOfNode = { payload: input };
  break;
```

### 6. Add event handler in executor

**File:** `apps/api/src/resources/flows/resource-flows-executor.service.ts`

```typescript
@OnEvent('matter.device.stateChange')
async handleMatterDeviceStateChange(event: MatterDeviceStateChangeEvent) {
  // Find all INPUT_MATTER_EVENT nodes
  const nodes = await this.flowNodeRepository.find({
    where: { type: ResourceFlowNodeType.INPUT_MATTER_EVENT },
    relations: ['resource'],
  });

  for (const node of nodes) {
    const nodeData = node.data as z.infer<typeof MatterEventNodeDataSchema>;

    // Match device
    if (nodeData.deviceId !== event.deviceId) continue;

    // Match event type
    if (nodeData.eventKey !== event.eventKey) continue;

    // Match filter value (optional)
    if (nodeData.filterValue && nodeData.filterValue !== event.humanValue.toLowerCase()
        && nodeData.filterValue !== String(event.value)) continue;

    // Build flow input payload
    const payload = {
      matter: {
        deviceId: event.deviceId,
        deviceName: event.deviceName,
        event: event.eventKey,
        eventLabel: event.eventLabel,
        value: event.humanValue.toLowerCase(), // e.g., "locked"
        valueLabel: event.humanValue,          // e.g., "Locked"
        previousValue: event.previousHumanValue?.toLowerCase(),
        previousValueLabel: event.previousHumanValue,
        rawValue: event.value,
        timestamp: event.timestamp.toISOString(),
      },
    };

    // Start the flow
    await this.startFlow(node.resourceId, node, payload);
  }
}
```

### 7. Export schema from entities-index

**File:** `libs/database-entities/src/lib/entities-index.ts`

Import and export `MatterEventNodeDataSchema`.

### 8. Add translations (if i18n is used)

Check if the flow node names are translated. If so, add entries for the new node type in the translation files.

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/resources/flows/resource-flows-executor.service.spec.ts --no-cache
```

Add tests to the existing executor test file (or create a focused test file):

1. **Event matching — happy path:**
   - Emit `matter.device.stateChange` with deviceId=1, eventKey="doorLock.lockState"
   - Node has deviceId=1, eventKey="doorLock.lockState", no filter
   - → Flow starts with correct payload

2. **Event matching — filter matches:**
   - Node has filterValue="locked"
   - Event has humanValue="Locked"
   - → Flow starts

3. **Event matching — filter doesn't match:**
   - Node has filterValue="locked"
   - Event has humanValue="Unlocked"
   - → Flow does NOT start

4. **Event matching — wrong device:**
   - Node has deviceId=1
   - Event has deviceId=2
   - → Flow does NOT start

5. **Event matching — wrong event type:**
   - Node has eventKey="doorLock.lockState"
   - Event has eventKey="doorLock.doorState"
   - → Flow does NOT start

6. **Multiple flows react to same event:**
   - Two nodes with same deviceId and eventKey
   - → Both flows start

7. **Payload structure:**
   - Verify `matter.value`, `matter.valueLabel`, `matter.deviceName` are present
   - Verify Handlebars template works: `{{matter.value}}` → "locked"

8. **Schema validation:**
   - `MatterEventNodeDataSchema.parse({ deviceId: 1, eventKey: 'doorLock.lockState' })` → succeeds
   - `MatterEventNodeDataSchema.parse({ deviceId: 1 })` → fails (eventKey required)
   - `MatterEventNodeDataSchema.parse({})` → fails (deviceId required)

---

## Security Checklist

- [ ] `deviceId` is a static integer in node config — NOT templatable
- [ ] `eventKey` is a static string — NOT templatable
- [ ] Filter comparison is case-insensitive (compare lowercase)
- [ ] No sensitive data (PIN codes, certificates) in the flow payload

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Modify** | `libs/database-entities/src/lib/entities/resourceFlowNode.ts` (add enum + schema) |
| **Modify** | `libs/database-entities/src/lib/entities-index.ts` (export schema) |
| **Modify** | `apps/api/src/resources/flows/resource-flows.service.ts` (add to getNodeSchemas) |
| **Modify** | `apps/api/src/resources/flows/resource-flows-executor.service.ts` (add switch case + event handler) |

---

## Definition of Done

- [ ] `INPUT_MATTER_EVENT` is a valid flow node type
- [ ] Schema validates deviceId, eventKey, optional filterValue
- [ ] Node appears in flow editor node picker (via getNodeSchemas)
- [ ] Event handler correctly matches device + event type + filter
- [ ] Flow starts with rich payload including human-readable values
- [ ] Multiple flows can react to the same event
- [ ] All tests pass
- [ ] Schema exported from `@attraccess/database-entities`
