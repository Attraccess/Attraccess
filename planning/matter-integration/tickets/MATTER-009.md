# MATTER-009: Subscription Manager & Event Emission

**Priority:** P0 — Core
**Dependencies:** MATTER-007 (connection manager), MATTER-002 (profiles)
**Parallel with:** MATTER-008
**Estimated scope:** ~250 lines + tests

---

## Goal

Subscribe to attribute changes and events on connected Matter devices. When a device state changes (e.g., lock state goes from unlocked to locked), emit a NestJS event that the flow executor can listen to.

---

## Context for the Agent

### How Matter subscriptions work
Matter supports attribute subscriptions with configurable min/max reporting intervals. When a subscribed attribute changes, the device pushes an update to the controller. Matter also supports event subscriptions (one-shot notifications like `LockOperation`).

```typescript
// Approximate matter.js API
const doorLock = connectedNode.getClusterClient(DoorLockCluster);

// Subscribe to attribute changes
doorLock.addLockStateAttributeListener((newValue, oldValue) => {
  // newValue: 1 (Locked), oldValue: 2 (Unlocked)
});

// Subscribe to events
doorLock.addLockOperationEventListener((event) => {
  // event.lockOperationType, event.operationSource, etc.
});
```

### What the flow executor needs
The flow executor (MATTER-011) will listen for this NestJS event:
```typescript
@OnEvent('matter.device.stateChange')
handleMatterEvent(event: MatterDeviceStateChangeEvent) { ... }
```

The event payload must be rich enough for the flow to filter and process:
```typescript
interface MatterDeviceStateChangeEvent {
  deviceId: number;
  deviceName: string;
  deviceType: number;
  // No resourceId — device-resource mapping lives in flow nodes, not on the device entity
  endpointId: number;
  clusterId: number;
  clusterName: string;
  type: 'attribute' | 'event';    // attribute change vs Matter event
  eventKey: string;               // profile key, e.g., "doorLock.lockState"
  eventLabel: string;             // "Lock State Changed"
  value: unknown;                 // raw Matter value
  humanValue: string;             // "Locked"
  previousValue?: unknown;        // for attribute changes
  previousHumanValue?: string;
  timestamp: Date;
}
```

### Profile integration (MATTER-002)
Use `resolveHumanValue()` and event profiles to map raw values to labels.

---

## Specification

### Create MatterSubscriptionService

**File:** `apps/api/src/matter/matter-subscription.service.ts`

**State:**
```typescript
private subscriptions = new Map<number, {
  deviceId: number;
  listeners: Array<{ clusterId: number; cleanup: () => void }>;
}>();
```

**Methods:**

#### `subscribeToDevice(device: MatterDevice): void`
Called when a device connects (by MATTER-007's online event handler).

1. Get connection from `MatterConnectionService.getConnection(device.id)`
2. Get device profile from `getProfileByDeviceType(device.deviceType)`
3. For each event in the profile:
   - If `type === 'attribute'`: subscribe to the attribute on the correct endpoint/cluster
   - If `type === 'event'`: subscribe to the event on the correct endpoint/cluster
4. On each subscription callback:
   - Build `MatterDeviceStateChangeEvent` with all fields
   - Deduplicate: if attribute value hasn't actually changed, skip emission
   - Emit `'matter.device.stateChange'` event via EventEmitter2
5. Store subscription cleanup functions in the `subscriptions` map

**Subscription parameters:**
- `minInterval`: 1 second
- `maxInterval`: 60 seconds
- These are Matter subscription reporting intervals — the device will report changes within this window

#### `unsubscribeFromDevice(deviceId: number): void`
1. Get subscriptions for device from map
2. Call each cleanup function
3. Remove from map

#### `resubscribeToDevice(device: MatterDevice): void`
1. Unsubscribe
2. Subscribe again
Used on reconnect.

**Lifecycle integration:**
Listen for connection events:
```typescript
@OnEvent('matter.device.online')
async handleDeviceOnline(event: { deviceId: number }) {
  const device = await this.deviceService.findOne(event.deviceId);
  this.subscribeToDevice(device);
}

@OnEvent('matter.device.offline')
handleDeviceOffline(event: { deviceId: number }) {
  this.unsubscribeFromDevice(event.deviceId);
}
```

**Deduplication logic:**
```typescript
// Store last known values per device+attribute
private lastValues = new Map<string, unknown>();

private shouldEmit(deviceId: number, eventKey: string, newValue: unknown): boolean {
  const key = `${deviceId}:${eventKey}`;
  const lastValue = this.lastValues.get(key);
  if (lastValue === newValue) return false;
  this.lastValues.set(key, newValue);
  return true;
}
```

**Fallback for devices without profiles:**
If no profile exists, subscribe to all server cluster attributes on all endpoints. Emit events with raw cluster/attribute names instead of profile labels. Set `eventKey` to `"raw.{clusterId}.{attributeId}"` and `humanValue` to `String(value)`.

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/matter-subscription.service.spec.ts --no-cache
```

**Unit tests:** Mock connection service, device service, event emitter, profile registry.

1. `subscribeToDevice()` — creates subscriptions for all profile events
2. Attribute change callback → emits `'matter.device.stateChange'` with correct payload
3. Attribute change with same value → NOT emitted (deduplication)
4. Attribute change with different value → emitted with previous value
5. `unsubscribeFromDevice()` — calls all cleanup functions, clears map
6. `resubscribeToDevice()` — unsubscribes then subscribes
7. `handleDeviceOnline` → subscribes to the device
8. `handleDeviceOffline` → unsubscribes from the device
9. Event payload includes `deviceId` for flow node matching (no resourceId — flows match by deviceId directly)
10. Device without profile → subscribes to raw clusters, emits with raw keys
11. Cleanup on `onModuleDestroy` → all subscriptions cleaned up

---

## Security Checklist

- [ ] State change events do not include sensitive data (no certs, no keys)
- [ ] PIN codes from lock operations are NOT included in event payloads
- [ ] Event emission is internal (NestJS EventEmitter) — not exposed via API directly
- [ ] Subscription cleanup prevents memory leaks
- [ ] `lastValues` map is cleaned up when device is disconnected

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter-subscription.service.ts` |
| **Create** | `apps/api/src/matter/matter-subscription.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add service) |

---

## Definition of Done

- [ ] Subscriptions created for all profile events when device connects
- [ ] `MatterDeviceStateChangeEvent` emitted on attribute/event changes
- [ ] Deduplication prevents redundant events
- [ ] Event payloads include both raw and human-readable values
- [ ] Subscriptions cleaned up on disconnect
- [ ] Auto-resubscribe on reconnect via online event handler
- [ ] Fallback works for devices without profiles
- [ ] All unit tests pass
- [ ] No memory leaks (subscriptions + lastValues cleaned up)
