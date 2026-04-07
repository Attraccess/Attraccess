# MATTER-008: Command Execution Service

**Priority:** P0 — Core
**Dependencies:** MATTER-004 (controller), MATTER-007 (connections)
**Parallel with:** MATTER-009
**Estimated scope:** ~200 lines + tests

---

## Goal

Create a service that sends commands to Matter devices (lock, unlock, read attributes) and logs all executions for audit trail. Used by both the flow command node (MATTER-012) and the management UI.

---

## Context for the Agent

### How Matter commands work
After a CASE session is established (MATTER-007), the controller can invoke cluster commands:
```typescript
// Example with matter.js (approximate API)
const doorLock = connectedNode.getClusterClient(DoorLockCluster);
await doorLock.lockDoor({});
await doorLock.unlockDoor({ pinCode: Buffer.from("1234") });
const lockState = await doorLock.getLockStateAttribute();
```

### Device profiles (MATTER-002)
Commands are identified by human-readable keys like `doorLock.lock`. The profile maps these to cluster IDs and command IDs:
```typescript
import { getCommandByKey } from './profiles';
const cmd = getCommandByKey(device.deviceType, 'doorLock.lock');
// cmd.clusterId = 0x0101, cmd.commandId = 0x00
```

### Existing event pattern
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
this.eventEmitter.emit('matter.command.executed', payload);
```

---

## Specification

### Create MatterCommandService

**File:** `apps/api/src/matter/matter-command.service.ts`

**Methods:**

#### `executeCommand(deviceId: number, commandKey: string, parameters?: Record<string, string>): Promise<MatterCommandResult>`

1. Load `MatterDevice` by ID → get `deviceType` and `endpoints`
2. Resolve `commandKey` via device profile: `getCommandByKey(device.deviceType, commandKey)`
   - If command not found in profile, throw `BadRequestException("Unknown command: {commandKey}")`
3. Get connection from `MatterConnectionService.getConnection(deviceId)`
   - If not connected, throw `ServiceUnavailableException("Device is offline")`
4. Find the endpoint that has the target cluster (from device's `endpoints` JSON)
5. Get the cluster client from the connected node
6. Invoke the command with timeout (10 seconds)
7. Build result:
   ```typescript
   interface MatterCommandResult {
     success: boolean;
     commandKey: string;
     commandLabel: string;
     deviceId: number;
     deviceName: string;
     parameters: Record<string, string>;
     result: unknown;
     executedAt: Date;
     error?: string;
   }
   ```
8. Emit `'matter.command.executed'` event with the result
9. Return the result

**Error handling:**
- Device not found → `NotFoundException`
- Device offline → `ServiceUnavailableException("Device '{name}' is offline. Check the device connection.")`
- Command not in profile → `BadRequestException`
- Command rejected by device → return `{ success: false, error: "Device rejected the command: {reason}" }`
- Timeout → return `{ success: false, error: "Command timed out after 10 seconds" }`

#### `readAttribute(deviceId: number, attributeKey: string): Promise<MatterAttributeValue>`

1. Load device, resolve attribute via profile: `getAttributeByKey(device.deviceType, attributeKey)`
2. Get connection, find endpoint with target cluster
3. Read attribute value
4. Resolve human-readable value: `resolveHumanValue(device.deviceType, attributeKey, rawValue)`
5. Return:
   ```typescript
   interface MatterAttributeValue {
     attributeKey: string;
     attributeLabel: string;
     rawValue: unknown;
     humanValue: string;
     deviceId: number;
     readAt: Date;
   }
   ```

#### Convenience methods (call `executeCommand` internally):
- `lockDoor(deviceId: number, pinCode?: string): Promise<MatterCommandResult>`
- `unlockDoor(deviceId: number, pinCode?: string): Promise<MatterCommandResult>`

### Create command API endpoint

Add to existing `MatterDeviceController` (or create `MatterCommandController`):

| Method | Path | Operation ID | Body | Description |
|--------|------|-------------|------|-------------|
| POST | `/api/matter/devices/:id/command` | `matterDevicesExecuteCommand` | `{ commandKey, parameters? }` | Execute command |
| GET | `/api/matter/devices/:id/state/:attributeKey` | `matterDevicesReadAttribute` | — | Read attribute |
| GET | `/api/matter/devices/:id/available-commands` | `matterDevicesGetAvailableCommands` | — | List commands |
| GET | `/api/matter/devices/:id/available-events` | `matterDevicesGetAvailableEvents` | — | List events |

**Guard:** `@Auth('canManageResources')` on all endpoints

**Available commands/events endpoints:**
These return the profile's commands/events for the device type. Used by both the management UI and the flow node editor.

```typescript
// GET /api/matter/devices/:id/available-commands
async getAvailableCommands(@Param('id', ParseIntPipe) id: number) {
  const device = await this.deviceService.findOne(id);
  const profile = getProfileByDeviceType(device.deviceType);
  return profile?.commands ?? [];
}
```

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/matter-command.service.spec.ts --no-cache
```

**Unit tests:** Mock connection service, device repository, profile registry.

1. `executeCommand()` — happy path: command resolved, executed, result returned, event emitted
2. `executeCommand()` — device not found → NotFoundException
3. `executeCommand()` — device offline → ServiceUnavailableException
4. `executeCommand()` — unknown command key → BadRequestException
5. `executeCommand()` — command rejected by device → success: false with error
6. `executeCommand()` — timeout → success: false with timeout error
7. `readAttribute()` — reads value and resolves human-readable label
8. `lockDoor()` → calls executeCommand with 'doorLock.lock'
9. `unlockDoor()` → calls executeCommand with 'doorLock.unlock'
10. `getAvailableCommands()` — returns profile commands for device type
11. `getAvailableCommands()` — returns empty array for unknown device type

---

## Security Checklist

- [ ] All command API endpoints require `@Auth('canManageResources')`
- [ ] Command keys validated against device profile — arbitrary commands rejected
- [ ] PIN codes in parameters: not logged in plain text (log "pinCode: [REDACTED]" if present)
- [ ] Event `'matter.command.executed'` emitted for every command (audit trail)
- [ ] Command timeout prevents hanging connections (10 second limit)
- [ ] Parameters validated by type (from profile definition) after template compilation
- [ ] `available-commands` endpoint returns profile data only — no device-specific secrets

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter-command.service.ts` |
| **Create** | `apps/api/src/matter/matter-command.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter-device.controller.ts` or **Create** `matter-command.controller.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add service + optional controller) |

---

## Definition of Done

- [ ] Commands execute on connected devices and return results
- [ ] Convenience methods (lockDoor, unlockDoor) work
- [ ] Attribute reads return human-readable values
- [ ] All error cases handled with user-friendly messages
- [ ] PIN codes redacted in logs/events
- [ ] Audit events emitted for all commands
- [ ] Available commands/events endpoints return profile data
- [ ] All unit tests pass
