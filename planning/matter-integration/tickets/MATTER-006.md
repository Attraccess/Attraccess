# MATTER-006: Commissioning Service & API

**Priority:** P0 — Core
**Dependencies:** MATTER-003 (parsing), MATTER-004 (controller service)
**Parallel with:** MATTER-007, MATTER-008
**Estimated scope:** ~300 lines across 3 files

---

## Goal

Implement the server-side Matter device commissioning flow: discover a device on the network, establish trust using the setup code, provision certificates, discover capabilities, and persist the device record. Also implement decommissioning (removal from fabric).

---

## Context for the Agent

### Commissioning flow
```
Frontend → POST /api/matter/devices/commission { setupCode, name? }
  1. Parse setup code → passcode + discriminator (MATTER-003)
  2. Discover device on local network via mDNS using discriminator
  3. PASE session: authenticate using passcode (SPAKE2+ key exchange)
  4. Provision NOC (Node Operational Certificate) → device joins Attraccess fabric
  5. CASE session: certificate-based communication established
  6. Read Descriptor cluster → discover endpoints, device types, clusters
  7. Store device in MatterDevice entity with endpoint map
  8. Return device info
```

### matter.js controller API (approximate)
The exact API depends on the installed version. General pattern:
```typescript
// Get the commissioning controller
const controller = this.matterControllerService.getController();

// Commission a device
const node = await controller.commission({
  passcode: parsedCode.passcode,
  discriminator: parsedCode.discriminator,
});

// After commissioning, read device info
const descriptor = node.getClusterClient(DescriptorCluster);
const deviceTypeList = await descriptor.getDeviceTypeListAttribute();
```

### Entity references
- `MatterDevice` from MATTER-001: stores the commissioned device
- `MatterFabric` from MATTER-001: the fabric the device joins
- `ParsedSetupCode` from MATTER-003: parsed QR/manual code

### Device profile integration
Use `getProfileByDeviceType()` from MATTER-002 (if available) to set `deviceTypeName`. If the profile doesn't exist, use the raw device type ID as a fallback name.

### Existing event pattern
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
this.eventEmitter.emit('matter.device.commissioned', { deviceId, deviceName });
```

---

## Specification

### 1. Create MatterCommissioningService

**File:** `apps/api/src/matter/matter-commissioning.service.ts`

**Methods:**

#### `commissionDevice(dto: CommissionDeviceDto): Promise<MatterDevice>`
1. Check `matterControllerService.isReady()` — if not, throw `ServiceUnavailableException`
2. Call `matterPairingService.parseSetupCode(dto.setupCode)` → get passcode + discriminator
3. Call matter.js controller to discover and commission:
   - Discovery timeout: 30 seconds
   - Commissioning timeout: 60 seconds
4. After commissioning, introspect the device:
   - Read Descriptor cluster on endpoint 0 → get endpoint list
   - For each endpoint, read its Descriptor → get device type and server cluster list
   - Build the `endpoints` JSON map
5. Determine device type from endpoint 1 (primary application endpoint):
   - Look up device profile (MATTER-002) for human-readable name
   - Fallback: "Unknown Device (type 0x{hex})"
6. Create and save `MatterDevice` entity:
   - `name`: from dto or auto-generate "{vendorName} {productName}" or "Matter Device {id}"
   - `nodeId`: from commissioning result
   - `vendorId`, `productId`: from commissioning or setup code
   - `vendorName`, `productName`: from device basic information cluster if available
   - `deviceType`: from primary endpoint device type
   - `commissioningData`: encrypt operational data via EncryptionService
   - `endpoints`: JSON string of endpoint/cluster map
   - `fabricId`: from the active fabric
   - `isOnline`: true (just commissioned)
   - `lastSeen`: now
7. Emit `'matter.device.commissioned'` event
8. Return the saved device

**Error handling — map to user-friendly messages:**
- Device not found within timeout → `"No device found on the network. Ensure the device is in pairing mode, powered on, and on the same network as the Attraccess server."`
- Wrong passcode → `"The setup code was rejected by the device. Please verify the QR code or manual code."`
- Commissioning timeout → `"Commissioning timed out. Try moving the device closer or check for network issues."`
- Already commissioned to this fabric → `"This device is already registered with Attraccess."`
- General error → `"Failed to commission the device: {error.message}"`

#### `decommissionDevice(deviceId: number, force?: boolean): Promise<void>`
1. Load `MatterDevice` by ID (throw NotFoundException if missing)
2. If not force:
   - Connect to device via CASE
   - Remove Attraccess fabric from device
3. Delete `MatterDevice` record from database
4. Emit `'matter.device.decommissioned'` event
5. If device is unreachable and not force: throw error suggesting force removal
6. If force: skip device communication, just delete record + log warning

#### `refreshDevice(deviceId: number): Promise<MatterDevice>`
1. Connect to device via CASE
2. Re-introspect endpoints/clusters
3. Update `MatterDevice.endpoints` and `lastSeen`
4. Return updated device

### 2. Create commissioning API endpoints

**File:** `apps/api/src/matter/matter-commissioning.controller.ts`

| Method | Path | Operation ID | Body | Description |
|--------|------|-------------|------|-------------|
| POST | `/api/matter/devices/commission` | `matterDevicesCommission` | `CommissionDeviceDto` | Commission new device |
| DELETE | `/api/matter/devices/:id/decommission` | `matterDevicesDecommission` | `{ force?: boolean }` | Remove from fabric |
| POST | `/api/matter/devices/:id/refresh` | `matterDevicesRefresh` | — | Re-introspect device |

**Guard:** All endpoints require `@Auth('canManageResources')`

**Commissioning response:** Return the `MatterDevice` entity (with `@Exclude()` fields hidden).

**Timeout handling:** Commissioning can take 30-60 seconds. Use a generous HTTP timeout or implement as async:
- Option A (simpler): Synchronous with long timeout — set NestJS timeout or document that the frontend should handle long responses
- Option B: Return 202 Accepted, poll for status — more complex
- **Recommend Option A** for v1.

### 3. Register in MatterModule

Add `MatterCommissioningService` and `MatterCommissioningController` to the module.
Import `EncryptionModule` if not already imported.

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/matter-commissioning.service.spec.ts --no-cache
```

**Unit tests:** `apps/api/src/matter/matter-commissioning.service.spec.ts`

Mock the matter.js controller, `MatterPairingService`, `MatterDevice` repository, and `EncryptionService`.

1. `commissionDevice()` — happy path:
   - Mock controller commission to succeed
   - Verify device saved with correct fields
   - Verify event emitted
   - Verify commissioningData is encrypted before save

2. `commissionDevice()` — controller not ready:
   - `isReady()` returns false → `ServiceUnavailableException`

3. `commissionDevice()` — device not found:
   - Mock controller to throw discovery timeout → user-friendly error

4. `commissionDevice()` — wrong passcode:
   - Mock controller to throw auth error → user-friendly error

5. `decommissionDevice()` — happy path:
   - Device exists and is reachable → removed from fabric + deleted from DB + event emitted

6. `decommissionDevice()` — device unreachable, no force:
   - Throws error suggesting force removal

7. `decommissionDevice()` — device unreachable, force=true:
   - Skips device communication, deletes from DB, logs warning

8. `refreshDevice()` — updates endpoints and lastSeen

**Security test:**
9. Verify `commissioningData` is encrypted (not plaintext JSON) in the saved entity

---

## Security Checklist

- [ ] Setup code NEVER logged (not even in error messages)
- [ ] `commissioningData` encrypted via `EncryptionService` before persistence
- [ ] All endpoints require `@Auth('canManageResources')`
- [ ] Device Attestation Certificate (DAC) verification is NOT disabled — let matter.js validate device authenticity by default
- [ ] Error messages don't leak internal Matter protocol details
- [ ] Commissioning events emitted for audit trail
- [ ] Force-decommission logs a warning (device removed from DB but may still trust old fabric)
- [ ] `CommissionDeviceDto.setupCode` not included in API response

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter-commissioning.service.ts` |
| **Create** | `apps/api/src/matter/matter-commissioning.controller.ts` |
| **Create** | `apps/api/src/matter/matter-commissioning.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add service + controller) |

---

## Definition of Done

- [ ] Commissioning works end-to-end (setup code → discovery → PASE → NOC → device saved)
- [ ] Decommissioning removes device from fabric and database
- [ ] Force decommission works for unreachable devices
- [ ] Refresh re-introspects device capabilities
- [ ] All error cases return user-friendly messages
- [ ] Setup code never logged or persisted
- [ ] CommissioningData encrypted at rest
- [ ] DAC verification enabled
- [ ] All unit tests pass
- [ ] Events emitted for commission/decommission
