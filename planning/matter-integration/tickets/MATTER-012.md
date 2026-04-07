# MATTER-012: Matter Command Flow Node — Backend

**Priority:** P0 — Flow Integration
**Dependencies:** MATTER-002 (profiles), MATTER-008 (command service)
**Parallel with:** MATTER-011
**Estimated scope:** ~250 lines across 3 files

---

## Goal

Add a new flow output node `output.matter.command` that sends a command to a Matter device when reached during flow execution. Users select a device, a command (e.g., "Unlock"), and optionally configure parameters.

---

## Context for the Agent

### How flow output nodes work
**File:** `apps/api/src/resources/flows/resource-flows-executor.service.ts`

Output nodes execute an action and return a result payload. Example — MQTT send:
```typescript
case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
  responseOfNode = await this.processMqttSendMessageNode(node, input, transactionManager);
  break;

// The handler:
private async processMqttSendMessageNode(node, input, txManager) {
  const data = node.data as z.infer<typeof MqttSendMessageNodeDataSchema>;
  const topic = compileTemplate(data.topic, input);
  const payload = compileTemplate(data.payload, input);
  await this.mqttClientService.publish(data.serverId, topic, payload, { qos: data.qos, retain: data.retain });
  return { payload: { ...input, mqtt: { topic, payload } } };
}
```

### Template compilation
The flow engine uses Handlebars for dynamic values:
```typescript
import { compileTemplate } from './template-utils'; // or wherever it's defined
const compiled = compileTemplate('Hello {{user.name}}', input);
```
Templates are used in parameter VALUES only — not in device IDs or command keys.

### Node schema pattern with `selectFromEntity`
```typescript
const MqttServerIdSchema = z.number().int().positive().meta({
  selectFromEntity: 'mqttServer',
  entityProperty: 'id',
});
```

### getNodeSchemas registration for output nodes
```typescript
case ResourceFlowNodeType.OUTPUT_MQTT_SEND_MESSAGE:
  schema.configSchema = z.toJSONSchema(MqttSendMessageNodeDataSchema);
  schema.inputs = ['input'];    // has input handle
  schema.supportedByResource = true;
  schema.isOutput = true;       // marked as output
  break;
```

---

## Specification

### 1. Add enum value

**File:** `libs/database-entities/src/lib/entities/resourceFlowNode.ts`

```typescript
OUTPUT_MATTER_COMMAND = 'output.matter.command',
```

### 2. Define Zod schema

```typescript
export const MatterCommandNodeDataSchema = z.object({
  deviceId: z.number().int().positive().meta({
    selectFromEntity: 'matterDevice',
    entityProperty: 'id',
  }),
  commandKey: z.string().min(1).meta({
    selectFromEntity: 'matterDeviceCommand',
    entityProperty: 'key',
    dependsOn: 'deviceId',
  }),
  parameters: z.record(z.string(), z.string()).optional().default({}).meta({
    dynamicFields: true,
    dependsOn: 'commandKey',
    helpText: 'Command parameters. Values support {{handlebars}} templates.',
  }),
});
```

### 3. Register in `getNodeDataSchema()`

```typescript
case ResourceFlowNodeType.OUTPUT_MATTER_COMMAND:
  return MatterCommandNodeDataSchema;
```

### 4. Register in `getNodeSchemas()`

**File:** `apps/api/src/resources/flows/resource-flows.service.ts`

```typescript
case ResourceFlowNodeType.OUTPUT_MATTER_COMMAND:
  schema.configSchema = z.toJSONSchema(MatterCommandNodeDataSchema);
  schema.inputs = ['input'];
  schema.outputs = ['output'];
  schema.supportedByResource = true;
  schema.isOutput = true;
  break;
```

### 5. Implement executor handler

**File:** `apps/api/src/resources/flows/resource-flows-executor.service.ts`

Add to `processNode()` switch:
```typescript
case ResourceFlowNodeType.OUTPUT_MATTER_COMMAND:
  responseOfNode = await this.processMatterCommandNode(node, input, transactionManager);
  break;
```

Implement handler:
```typescript
private async processMatterCommandNode(
  node: ResourceFlowNode,
  input: object,
  transactionManager?: EntityManager,
): Promise<NodeProcessingResult> {
  const data = node.data as z.infer<typeof MatterCommandNodeDataSchema>;

  // 1. Validate command key is static (not templated)
  //    commandKey must exactly match a profile command
  //    deviceId must be a static number

  // 2. Compile template values in parameters only
  const compiledParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.parameters ?? {})) {
    compiledParams[key] = compileTemplate(value, input);
  }

  // 3. Rate limit check (see below)
  this.checkRateLimit(data.deviceId);

  // 4. Execute command
  const result = await this.matterCommandService.executeCommand(
    data.deviceId,
    data.commandKey,
    compiledParams,
  );

  // 5. If command failed, throw to stop flow
  if (!result.success) {
    throw new Error(`Matter command failed: ${result.error}`);
  }

  // 6. Return enriched payload
  return {
    payload: {
      ...input,
      matter: {
        command: result.commandKey,
        commandLabel: result.commandLabel,
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        success: result.success,
        result: result.result,
        executedAt: result.executedAt.toISOString(),
      },
    },
  };
}
```

### 6. Implement rate limiting

Add to the executor service (or create a separate utility):

```typescript
private commandCounts = new Map<number, { count: number; windowStart: number }>();
private readonly RATE_LIMIT = parseInt(process.env.MATTER_COMMAND_RATE_LIMIT || '10', 10);
private readonly RATE_WINDOW_MS = 60_000; // 1 minute

private checkRateLimit(deviceId: number): void {
  const now = Date.now();
  const entry = this.commandCounts.get(deviceId);

  if (!entry || now - entry.windowStart > this.RATE_WINDOW_MS) {
    this.commandCounts.set(deviceId, { count: 1, windowStart: now });
    return;
  }

  entry.count++;
  if (entry.count > this.RATE_LIMIT) {
    throw new Error(
      `Rate limit exceeded: more than ${this.RATE_LIMIT} commands per minute to device ${deviceId}. ` +
      `This may indicate an infinite loop in the flow.`
    );
  }
}
```

### 7. Export from entities-index

Add `MatterCommandNodeDataSchema` to exports in `libs/database-entities/src/lib/entities-index.ts`.

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/resources/flows/resource-flows-executor.service.spec.ts --no-cache
```

1. **Happy path:** Command node executes, command service called with correct args, payload returned
2. **Template compilation:** Parameter `{{user.name}}` resolves from input payload
3. **Command failure:** Command service returns `success: false` → node throws, flow stops
4. **Device offline:** Command service throws ServiceUnavailableException → node throws
5. **Rate limit:** 11 commands in 1 minute → 11th throws rate limit error
6. **Rate limit reset:** After 60 seconds, counter resets, command succeeds
7. **Schema validation:**
    - `{ deviceId: 1, commandKey: 'doorLock.lock' }` → valid
    - `{ deviceId: 1 }` → invalid (commandKey required)
    - `{ commandKey: 'doorLock.lock' }` → invalid (deviceId required)

---

## Security Checklist

- [ ] `deviceId` is static integer — NOT templatable (validated at schema level)
- [ ] `commandKey` is static string — NOT templatable (validated at schema level)
- [ ] Only `parameters` values support Handlebars templates
- [ ] Command key validated against device profile before execution (in command service, MATTER-008)
- [ ] Rate limiting prevents device flooding (default 10/min, configurable via `MATTER_COMMAND_RATE_LIMIT`)
- [ ] Any device can be used in any resource's flow (no device-resource FK coupling)
- [ ] PIN code parameters redacted in logs (handled by command service)
- [ ] Failed commands throw and stop flow execution (no silent failures)

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MATTER_COMMAND_RATE_LIMIT` | `10` | Max commands per device per minute via flow nodes |

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Modify** | `libs/database-entities/src/lib/entities/resourceFlowNode.ts` (add enum + schema) |
| **Modify** | `libs/database-entities/src/lib/entities-index.ts` (export schema) |
| **Modify** | `apps/api/src/resources/flows/resource-flows.service.ts` (add to getNodeSchemas + save validation) |
| **Modify** | `apps/api/src/resources/flows/resource-flows-executor.service.ts` (add switch case + handler + rate limiter) |

---

## Definition of Done

- [ ] `OUTPUT_MATTER_COMMAND` is a valid flow node type
- [ ] Schema validates deviceId, commandKey, optional parameters
- [ ] Executor handler compiles parameter templates and calls command service
- [ ] Rate limiting enforced (10/min default)
- [ ] Failed commands throw and stop flow
- [ ] Output payload includes command result for downstream nodes
- [ ] All tests pass
- [ ] Schema exported from `@attraccess/database-entities`
