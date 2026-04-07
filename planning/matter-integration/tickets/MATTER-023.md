# MATTER-023: Thread-Aware Commissioning

**Priority:** P1 — Thread Integration
**Dependencies:** MATTER-006 (commissioning service), MATTER-019 (TBR + Thread network)
**Parallel with:** MATTER-020, MATTER-021, MATTER-022
**Estimated scope:** ~250 lines across 4 files

---

## Goal

Extend the Matter commissioning service to support Thread devices. Thread devices require a different commissioning path than Wi-Fi devices: they need BLE for initial pairing and Thread network credentials must be injected during commissioning. This ticket also handles the matter.js Thread credential configuration needed for the controller to route through the TBR.

---

## Context for the Agent

### Wi-Fi vs Thread commissioning

**Wi-Fi/Ethernet devices (current MATTER-006 flow):**
1. Device is on the IP network
2. Controller discovers via mDNS
3. PASE over IP → NOC provisioning → done

**Thread devices (this ticket):**
1. Device is NOT on the IP network (it's on 802.15.4, unreachable without a TBR)
2. Device advertises via BLE (Bluetooth Low Energy)
3. Controller connects via BLE for initial PASE
4. Controller sends Thread network credentials over the BLE channel
5. Device joins the Thread mesh using those credentials
6. TBR routes device's IPv6 traffic to the IP network
7. Controller discovers the device via mDNS (published by TBR's SRP server)
8. CASE session established over IP (routed through TBR) → device operational

### matter.js Thread support
The `@matter/main` controller supports Thread commissioning. Key APIs (approximate):

```typescript
// Configure Thread credentials on the controller
// The controller needs the Thread dataset to provide to devices during commissioning
controller.setThreadOperationalDataset(datasetHex);

// Commission a Thread device
// matter.js handles BLE discovery, PASE, credential transfer, and CASE
await controller.commission({
  passcode: setupCode.passcode,
  discriminator: setupCode.discriminator,
  // Thread devices are discovered via BLE, not mDNS
  discoveryType: 'ble',  // or however matter.js exposes this
});
```

**BLE requirement:** matter.js uses the system's Bluetooth stack. On Linux (Raspberry Pi, NUC), it uses BlueZ via D-Bus. On macOS, it uses the native CoreBluetooth stack. BLE support in matter.js may need the `--ble-enable` flag or specific configuration.

### Thread credentials from OTBR
The OTBR stores the Thread operational dataset. The commissioning service needs to:
1. Read the dataset from OTBR: `GET /node/dataset/active`
2. Encode it as hex TLV (OTBR may return JSON or hex depending on endpoint)
3. Provide it to the matter.js controller for Thread device commissioning

### Existing commissioning service (MATTER-006)
**File:** `apps/api/src/matter/matter-commissioning.service.ts`

The `commissionDevice()` method currently handles IP-based commissioning. It needs to be extended to detect whether the target device is a Thread device (from the QR code's discovery capabilities) and use the Thread commissioning path.

### QR code discovery capabilities
The Matter QR code includes a `discoveryCapabilities` bitmask:
- Bit 0: SoftAP (Wi-Fi)
- Bit 1: BLE
- Bit 2: On-Network (IP)

Thread devices typically have BLE=1 and On-Network=0 (since they're not on IP until they join Thread). This bitmask tells the controller which discovery method to use.

---

## Specification

### 1. Extend MatterControllerService for Thread

**File:** `apps/api/src/matter/matter-controller.service.ts` (modify)

Add Thread credential configuration:

```typescript
// Called when a Thread network is created/updated
async setThreadCredentials(tbrId: number): Promise<void> {
  const tbrService = this.moduleRef.get(ThreadNetworkService);
  const credentials = await tbrService.getThreadCredentials(tbrId);

  const controller = this.getController();
  // Configure the controller with Thread operational dataset
  // Exact API depends on matter.js version
  await controller.setThreadOperationalDataset(credentials.datasetHex);

  this.logger.log(`Thread credentials configured from TBR ${tbrId} (network: ${credentials.networkName})`);
}

// Check if BLE is available for Thread commissioning
async isBleAvailable(): Promise<boolean> {
  // Check if the system has a Bluetooth adapter
  // On Linux: check for BlueZ/D-Bus
  // On macOS: check for CoreBluetooth
  // Return false if not available
}
```

### 2. Extend commissioning service for Thread path

**File:** `apps/api/src/matter/matter-commissioning.service.ts` (modify)

Update `commissionDevice()`:

```typescript
async commissionDevice(dto: CommissionDeviceDto): Promise<MatterDevice> {
  // ... existing setup code parsing ...

  const parsedCode = this.pairingService.parseSetupCode(dto.setupCode);

  // Determine commissioning path from QR code discovery capabilities
  const isThreadDevice = this.isLikelyThreadDevice(parsedCode);

  if (isThreadDevice) {
    return this.commissionThreadDevice(parsedCode, dto);
  } else {
    return this.commissionIpDevice(parsedCode, dto); // existing flow
  }
}

private isLikelyThreadDevice(code: ParsedSetupCode): boolean {
  // If QR code has discovery capabilities (from QR, not manual code):
  if (code.discoveryCapabilities) {
    const hasBle = (code.discoveryCapabilities & 0x02) !== 0;
    const hasOnNetwork = (code.discoveryCapabilities & 0x04) !== 0;
    // Thread devices: BLE yes, On-Network no
    return hasBle && !hasOnNetwork;
  }
  // Manual codes don't include discovery capabilities
  // Default to IP-based commissioning; user can override
  return false;
}

private async commissionThreadDevice(
  parsedCode: ParsedSetupCode,
  dto: CommissionDeviceDto,
): Promise<MatterDevice> {
  // 1. Check BLE availability
  const bleAvailable = await this.controllerService.isBleAvailable();
  if (!bleAvailable) {
    throw new ServiceUnavailableException(
      'Thread device detected but Bluetooth is not available on this server. ' +
      'Thread devices require Bluetooth for initial pairing. ' +
      'Ensure the server has a Bluetooth adapter and BlueZ is installed.'
    );
  }

  // 2. Check Thread network is configured
  const tbrs = await this.tbrRepository.find({ where: { state: Not('disabled') } });
  if (tbrs.length === 0) {
    throw new PreconditionFailedException(
      'Thread device detected but no Thread Border Router is configured. ' +
      'Set up a Thread Border Router first in Matter → Thread Border Routers.'
    );
  }

  // 3. Ensure controller has Thread credentials
  const activeTbr = tbrs.find(t => t.threadNetworkName);
  if (!activeTbr) {
    throw new PreconditionFailedException(
      'Thread Border Router found but no Thread network is configured. ' +
      'Create a Thread network first.'
    );
  }
  await this.controllerService.setThreadCredentials(activeTbr.id);

  // 4. Commission via BLE
  const controller = this.controllerService.getController();
  // matter.js handles: BLE discovery → PASE → Thread credential transfer → mesh join → CASE
  const node = await controller.commission({
    passcode: parsedCode.passcode,
    discriminator: parsedCode.discriminator,
    // Thread-specific options (exact API TBD based on matter.js version)
  });

  // 5. Wait for device to appear on IP network (via TBR's mDNS)
  // After Thread credentials are transferred, the device joins the mesh
  // and the TBR publishes its mDNS record. This can take 10-30 seconds.
  await this.waitForDeviceOnNetwork(node, 60000); // 60s timeout

  // 6. Complete commissioning (same as IP path from here)
  return this.finalizeCommissioning(node, dto, 'thread');
}
```

### 3. Update ParsedSetupCode to include discovery capabilities

**File:** `apps/api/src/matter/matter-pairing.service.ts` (modify)

```typescript
export interface ParsedSetupCode {
  passcode: number;
  discriminator: number;
  vendorId?: number;
  productId?: number;
  discoveryCapabilities?: number; // bitmask from QR code
  source: 'qr' | 'manual';
}
```

The QR code parser already decodes this field — just expose it in the return type.

### 4. Update commissioning wizard (frontend)

**File:** `apps/frontend/src/app/matter/commission/CommissionModal.tsx` (modify)

Add Thread-aware messaging in the commissioning progress step:

- If the backend returns a Thread-specific error (no BLE, no TBR, no network):
  - Show the error with actionable guidance
  - Link to Thread Border Router setup page
- During Thread commissioning:
  - Show additional progress text: "Connecting via Bluetooth... Transferring Thread network credentials... Waiting for device to join the mesh..."
  - Thread commissioning takes longer (60-90s vs 30-60s) — update timeout expectations

### 5. Add BLE availability check endpoint

**File:** `apps/api/src/matter/matter-device.controller.ts` (modify health endpoint)

Extend the health response:

```typescript
{
  // ... existing fields ...
  ble: {
    available: boolean;
    adapter: string | null; // e.g., "hci0" on Linux
  },
  thread: {
    // ... existing thread fields ...
  }
}
```

### 6. Handle "user forces IP commissioning" for dual-mode devices

Some devices support both Thread and Wi-Fi. The QR code will have both BLE and On-Network bits set. Allow the user to choose:

Add to `CommissionDeviceDto`:
```typescript
@IsOptional()
@IsEnum(['auto', 'ip', 'thread'])
commissioningMethod?: 'auto' | 'ip' | 'thread'; // default: 'auto'
```

- `auto`: Use QR code discovery capabilities to decide
- `ip`: Force IP/mDNS commissioning (for Wi-Fi devices)
- `thread`: Force BLE + Thread commissioning

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/matter-commissioning.service.spec.ts --no-cache
```

**Unit tests** (add to existing MATTER-006 tests):

1. `isLikelyThreadDevice()` — QR with BLE=1, OnNetwork=0 → true (Thread)
2. `isLikelyThreadDevice()` — QR with BLE=0, OnNetwork=1 → false (Wi-Fi)
3. `isLikelyThreadDevice()` — QR with BLE=1, OnNetwork=1 → false (dual-mode, default to IP)
4. `isLikelyThreadDevice()` — manual code (no capabilities) → false
5. `commissionThreadDevice()` — no BLE → ServiceUnavailableException with helpful message
6. `commissionThreadDevice()` — no TBR registered → PreconditionFailedException
7. `commissionThreadDevice()` — TBR exists but no Thread network → PreconditionFailedException
8. `commissionThreadDevice()` — happy path (mock BLE + controller) → device saved with transport: 'thread'
9. `commissioningMethod: 'thread'` forces Thread path even for dual-mode device
10. `commissioningMethod: 'ip'` forces IP path even when BLE available
11. Thread credentials loaded from OTBR before commissioning

---

## Security Checklist

- [ ] Thread network credentials handled securely during commissioning (encrypted in transit within the process, never logged)
- [ ] BLE pairing uses Matter's SPAKE2+ — no custom BLE security needed
- [ ] BLE adapter access requires appropriate system permissions (document: user must be in `bluetooth` group on Linux)
- [ ] Thread commissioning timeout prevents indefinite BLE scanning
- [ ] Error messages guide users to setup without exposing internal state
- [ ] `commissioningMethod` validated (only 'auto', 'ip', 'thread' accepted)

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Modify** | `apps/api/src/matter/matter-controller.service.ts` (add Thread credential config + BLE check) |
| **Modify** | `apps/api/src/matter/matter-commissioning.service.ts` (add Thread commissioning path) |
| **Modify** | `apps/api/src/matter/matter-pairing.service.ts` (expose discoveryCapabilities) |
| **Modify** | `apps/api/src/matter/dto/commission-device.dto.ts` (add commissioningMethod) |
| **Modify** | `apps/frontend/src/app/matter/commission/CommissionModal.tsx` (Thread-aware UI) |
| **Modify** | `apps/api/src/matter/matter-device.controller.ts` (add BLE to health) |
| **Modify** | `apps/api/src/matter/matter-commissioning.service.spec.ts` (add Thread tests) |

---

## Definition of Done

- [ ] Thread devices detected from QR code discovery capabilities
- [ ] Thread commissioning path: BLE → PASE → Thread creds → mesh join → CASE
- [ ] Clear errors when BLE unavailable or TBR not configured
- [ ] Thread credentials loaded from OTBR automatically
- [ ] User can force commissioning method (auto/ip/thread)
- [ ] Frontend shows Thread-specific progress and error messages
- [ ] Health endpoint shows BLE availability
- [ ] All unit tests pass
- [ ] IP-based commissioning still works (no regression)

---

## Hardware Requirements

For Thread device commissioning, the Attraccess server needs:

| Requirement | Details |
|-------------|---------|
| Bluetooth adapter | USB dongle (e.g., TP-Link UB500) or built-in (Raspberry Pi) |
| BlueZ | Linux Bluetooth stack (install: `apt install bluez`) |
| D-Bus access | matter.js uses D-Bus to talk to BlueZ |
| `bluetooth` group | The user running Attraccess must be in the `bluetooth` group |
| Docker | If running in Docker, `--privileged` or device passthrough for `/dev/bus/usb` |

**For Docker deployments:** The Attraccess container needs access to the host's Bluetooth adapter:
```yaml
# In docker-compose.yml for the attraccess service:
devices:
  - /dev/bus/usb:/dev/bus/usb  # USB Bluetooth adapter
# OR
privileged: true  # Less secure but simpler
```

**For Balena:** Bluetooth is typically available in containers with the `io.balena.features.dbus: '1'` label.

Document these requirements clearly in the setup guide.
