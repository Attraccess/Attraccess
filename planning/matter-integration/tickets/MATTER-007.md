# MATTER-007: Connection Manager Service

**Priority:** P0 — Core
**Dependencies:** MATTER-004 (controller service)
**Parallel with:** MATTER-005, MATTER-006, MATTER-008
**Estimated scope:** ~200 lines + tests

---

## Goal

Maintain persistent CASE sessions with all commissioned Matter devices, automatically reconnect on failure, and track connection state. This is the "always-on" layer that enables subscriptions and commands.

---

## Context for the Agent

### What is a CASE session?
After a device is commissioned (trust established via certificates), all subsequent communication uses **CASE** (Certificate Authenticated Session Establishment). The connection manager maintains these authenticated sessions so commands and subscriptions work instantly.

### Existing connection pattern — `MqttClientService`
**File:** `apps/api/src/mqtt/mqtt-client.service.ts`
The MQTT client service maintains a `Map<serverId, client>` of active connections and reconnects on failure. The Matter connection manager follows the same pattern but for Matter CASE sessions.

### Entity references
- `MatterDevice` from MATTER-001: read on startup to get list of devices to connect to
- `MatterControllerService` from MATTER-004: provides the controller for establishing CASE sessions

---

## Specification

### Create MatterConnectionService

**File:** `apps/api/src/matter/matter-connection.service.ts`

**State:**
```typescript
private connections = new Map<number, {
  state: 'connecting' | 'connected' | 'disconnected' | 'error';
  node: any; // matter.js connected node reference
  retryCount: number;
  retryTimer?: NodeJS.Timeout;
  lastError?: string;
}>();
```

**Lifecycle:**

#### `onModuleInit()`
1. Wait for `matterControllerService.isReady()` — if not ready, skip (log info)
2. Load all `MatterDevice` records from database
3. For each device, call `connectDevice(device)` — do NOT await all in sequence; use `Promise.allSettled()` for parallel connection
4. Log: "Connecting to {count} Matter devices..."

#### `onModuleDestroy()`
1. Cancel all retry timers
2. Close all connections gracefully
3. Clear the connections map

**Methods:**

#### `connectDevice(device: MatterDevice): Promise<void>`
1. Set state to `connecting`
2. Get controller from `matterControllerService.getController()`
3. Establish CASE session to the device using stored node ID
4. On success:
   - Set state to `connected`, reset retryCount to 0
   - Update `MatterDevice.isOnline = true`, `lastSeen = now`
   - Emit `'matter.device.online'` event with `{ deviceId, deviceName }`
5. On failure:
   - Set state to `error`, store error message
   - Update `MatterDevice.isOnline = false`
   - Schedule retry with exponential backoff
   - Emit `'matter.device.offline'` event

#### `disconnectDevice(deviceId: number): void`
- Cancel retry timer
- Close CASE session if active
- Remove from connections map

#### `getConnection(deviceId: number): ConnectedNode | undefined`
- Return the matter.js node reference if connected, undefined if not
- Used by command service and subscription manager

#### `getConnectionState(deviceId: number): ConnectionState`
- Return `{ state, lastError, retryCount }`

#### `isDeviceConnected(deviceId: number): boolean`
- Convenience check

**Reconnection strategy:**
- Exponential backoff: 5s, 10s, 30s, 60s, 300s (5 min cap)
- Formula: `min(5 * 2^retryCount, 300)` seconds
- No maximum retry count — keep trying forever (devices may be temporarily offline)
- On reconnect success, emit `'matter.device.online'` event

**Events emitted:**
- `'matter.device.online'` — `{ deviceId: number, deviceName: string }`
- `'matter.device.offline'` — `{ deviceId: number, deviceName: string, error: string }`

**Integration points:**
- When MATTER-006 commissions a new device, it should call `connectDevice()` to immediately establish a connection
- When MATTER-006 decommissions a device, it should call `disconnectDevice()`

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/matter-connection.service.spec.ts --no-cache
```

**Unit tests:** `apps/api/src/matter/matter-connection.service.spec.ts`

Mock matter.js controller, MatterDevice repository, and EventEmitter2.

1. `onModuleInit()` — connects to all devices in database
2. `onModuleInit()` — skips if controller not ready
3. `connectDevice()` — successful connection sets state to 'connected', emits online event
4. `connectDevice()` — failure sets state to 'error', emits offline event, schedules retry
5. Retry backoff: verify increasing intervals (5s, 10s, 30s, 60s, 300s cap)
6. `disconnectDevice()` — cancels retry timer, closes connection, removes from map
7. `getConnection()` — returns node reference when connected, undefined when not
8. `isDeviceConnected()` — true when connected, false otherwise
9. `onModuleDestroy()` — all timers cancelled, all connections closed
10. Reconnect success — emits online event, resets retry count

---

## Security Checklist

- [ ] CASE sessions use certificate-based authentication (handled by matter.js — don't override)
- [ ] No device credentials logged
- [ ] Connection state changes logged at INFO level (device ID and name only — no certificates)
- [ ] Retry timers properly cancelled on shutdown (no leaked timers)
- [ ] `getConnection()` returns undefined (not throws) for unknown devices — callers must handle gracefully

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter-connection.service.ts` |
| **Create** | `apps/api/src/matter/matter-connection.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add service) |

---

## Definition of Done

- [ ] Connects to all commissioned devices on startup
- [ ] Reconnects automatically with exponential backoff
- [ ] Emits online/offline events on state changes
- [ ] Updates `MatterDevice.isOnline` and `lastSeen` accurately
- [ ] Graceful shutdown: all timers cancelled, connections closed
- [ ] `getConnection()` returns usable node reference for connected devices
- [ ] All unit tests pass
- [ ] No resource leaks (timers, connections) on shutdown
