# MATTER-020: SLZB-06 Integration Service

**Priority:** P1 — Thread / SLZB-06
**Dependencies:** MATTER-019 (TBR entity and OTBR client)
**Parallel with:** MATTER-021, all non-Thread tickets
**Estimated scope:** ~300 lines across 4 files

---

## Goal

Create first-class support for the SMLIGHT SLZB-06 (and SLZB-06M/MU variants) as a Thread Radio Co-Processor. Implement auto-discovery via mDNS, firmware mode detection, health monitoring, and a guided setup flow for switching the device to Thread RCP mode.

---

## Context for the Agent

### What is the SLZB-06?
The SMLIGHT SLZB-06 is a multiprotocol Zigbee/Thread coordinator with Ethernet (PoE), USB, and WiFi connectivity. It has two chips:
- **EFR32MG21** (or CC2652P on original): Runs Zigbee coordinator, Zigbee router, or **Thread RCP** firmware
- **ESP32/ESP32-S3**: Runs SLZB-OS (web management, networking, mDNS)

For Matter-over-Thread, the EFR32MG21 must be flashed with **Thread RCP firmware**. The SLZB-06 then acts as a network-attached radio that OTBR connects to via `spinel+hdlc+tcp://<ip>:<port>`.

### SLZB-06 discovery and status
- **mDNS**: Advertises as `slzb-06.local` / `slzb-06m.local` (Zeroconf)
- **Home Assistant endpoints** (best for programmatic access):
  - `GET http://<ip>/ha_info` → device info JSON (model, firmware, MAC, IP, chip type)
  - `GET http://<ip>/ha_sensors` → sensor data (uptime, temperature, free heap, connection type)
- **Prometheus**: `GET http://<ip>/metrics`
- **SSE**: `GET http://<ip>/events` for real-time status updates

### SLZB-06 `/ha_info` response example
```json
{
  "device": {
    "model": "SLZB-06M",
    "sw_version": "3.2.4",
    "manufacturer": "SMLIGHT",
    "hw_version": "2.0",
    "mac": "AA:BB:CC:DD:EE:FF",
    "ip": "192.168.1.100"
  },
  "chip": {
    "type": "EFR32MG21",
    "firmware": "Thread RCP",
    "version": "4.4.2"
  },
  "connectivity": {
    "type": "ethernet",
    "signal": null
  }
}
```

### SLZB-06 serial-over-TCP
When in Thread RCP mode, the SLZB-06 exposes the RCP serial stream over TCP (typically port 6638). OTBR connects with radio URL:
```
spinel+hdlc+tcp://192.168.1.100:6638
```

### Existing IoT device patterns
The **Attractap** reader in Attraccess follows a similar pattern:
- Device discovery and registration
- Firmware version tracking
- Health monitoring (lastConnection, isOnline)
- Web-based configuration

---

## Specification

### 1. Create Slzb06Service

**File:** `apps/api/src/matter/thread/slzb06.service.ts`

**Auto-discovery:**

```typescript
@Injectable()
export class Slzb06Service implements OnModuleInit {
  // Discover SLZB-06 devices on the network via mDNS
  async discoverDevices(timeout?: number): Promise<Slzb06DiscoveryResult[]>

  // Get device info from a known IP
  async getDeviceInfo(host: string): Promise<Slzb06DeviceInfo>

  // Get sensor data (uptime, temperature, etc.)
  async getSensorData(host: string): Promise<Slzb06SensorData>

  // Check if device is in Thread RCP mode
  async isThreadRcpMode(host: string): Promise<boolean>

  // Get the serial-over-TCP port for RCP connection
  async getRcpPort(host: string): Promise<number>

  // Health check
  async checkHealth(host: string): Promise<Slzb06HealthStatus>
}
```

**mDNS discovery implementation:**
- Use Node.js `dgram` + mDNS query for `_http._tcp.local.` services with `slzb` in the name
- OR use a lightweight mDNS library (e.g., `bonjour-service` — MIT, ~100 downloads/week but simple)
- OR use DNS-SD via matter.js's built-in mDNS resolver
- **Recommended:** Use direct HTTP scan — for a known subnet, try `GET /ha_info` on common IPs. Simpler and more reliable than mDNS parsing. But primarily support manual entry of IP address, with mDNS discovery as a convenience.

**Interfaces:**

```typescript
interface Slzb06DeviceInfo {
  model: string;           // "SLZB-06M", "SLZB-06MU"
  firmwareVersion: string; // "3.2.4"
  manufacturer: string;    // "SMLIGHT"
  hardwareVersion: string;
  macAddress: string;
  ipAddress: string;
  chipType: string;        // "EFR32MG21", "CC2652P"
  chipFirmware: string;    // "Thread RCP", "Zigbee Coordinator"
  chipFirmwareVersion: string;
  connectivityType: string; // "ethernet", "wifi", "usb"
}

interface Slzb06SensorData {
  uptimeSeconds: number;
  temperatureCelsius: number | null;
  freeHeapBytes: number;
  connectionType: string;
}

interface Slzb06HealthStatus {
  reachable: boolean;
  model: string | null;
  isThreadRcpMode: boolean;
  firmwareVersion: string | null;
  chipFirmwareVersion: string | null;
  uptimeSeconds: number | null;
  connectivityType: string | null;
}

interface Slzb06DiscoveryResult {
  host: string;
  model: string;
  isThreadMode: boolean;
}
```

### 2. Create SLZB-06 setup wizard API

**File:** `apps/api/src/matter/thread/slzb06.controller.ts`

| Method | Path | Operation ID | Description |
|--------|------|-------------|-------------|
| GET | `/api/matter/thread/slzb06/discover` | `slzb06Discover` | Discover SLZB-06 devices on network |
| GET | `/api/matter/thread/slzb06/info` | `slzb06GetInfo` | Get device info by IP (`?host=...`) |
| POST | `/api/matter/thread/slzb06/register` | `slzb06Register` | Register SLZB-06 as TBR + create OTBR config |

**Guard:** `@Auth('canManageResources')`

#### Register flow (`POST /register`)

**Body:**
```typescript
export class RegisterSlzb06Dto {
  @IsString() @IsNotEmpty()
  host!: string; // SLZB-06 IP address

  @IsString() @IsNotEmpty()
  name!: string; // Friendly name

  @IsString() @IsOptional()
  otbrHost?: string; // OTBR host (default: same as Attraccess server, i.e., localhost)

  @IsInt() @IsOptional()
  otbrPort?: number; // OTBR REST API port (default: 8081)
}
```

**Logic:**
1. Verify SLZB-06 is reachable: `GET /ha_info`
2. Check if in Thread RCP mode:
   - If yes → proceed
   - If no → return info with `isThreadRcpMode: false` and instructions to switch mode via SLZB-06 web UI. **Do NOT auto-switch** — changing firmware mode is destructive (drops all Zigbee pairings).
3. Get RCP serial-over-TCP port
4. Create `ThreadBorderRouter` entity with type `'slzb06'`:
   - `host`: OTBR REST API host
   - `port`: OTBR REST API port
   - `rcpHost`: SLZB-06 IP
   - `rcpPort`: serial-over-TCP port
5. Return the created TBR with OTBR radio URL for OTBR configuration

**Response includes:**
```json
{
  "threadBorderRouter": { ... },
  "otbrRadioUrl": "spinel+hdlc+tcp://192.168.1.100:6638",
  "setupInstructions": {
    "step1": "Ensure OTBR Docker container is running with the radio URL above",
    "step2": "Create a Thread network via the TBR management page",
    "step3": "Commission Thread devices"
  }
}
```

### 3. Periodic health monitoring

In `Slzb06Service.onModuleInit()`:
- Start a `@Cron(CronExpression.EVERY_5_MINUTES)` job
- For each `ThreadBorderRouter` with type `'slzb06'`:
  - Check SLZB-06 health via `/ha_info`
  - Check OTBR health via `OtbrClientService.checkHealth()`
  - Update entity state, isOnline, lastSeen
  - If SLZB-06 was online but is now unreachable → log warning
  - If SLZB-06 firmware changed → log info + update entity

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/thread/slzb06.service.spec.ts --no-cache
```

**Unit tests** (mock HTTP responses):

1. `getDeviceInfo()` — parses `/ha_info` response correctly
2. `getDeviceInfo()` — SLZB-06 unreachable → throws with user-friendly message
3. `getSensorData()` — parses `/ha_sensors` response
4. `isThreadRcpMode()` — returns true when chip firmware is "Thread RCP"
5. `isThreadRcpMode()` — returns false when chip firmware is "Zigbee Coordinator"
6. `checkHealth()` — returns reachable=true with all fields populated
7. `checkHealth()` — returns reachable=false on timeout
8. Register: SLZB-06 in Thread mode → creates TBR entity with correct radio URL
9. Register: SLZB-06 NOT in Thread mode → returns instructions, does NOT create entity
10. Register: SLZB-06 unreachable → error with helpful message
11. Health monitoring updates entity state correctly

---

## Security Checklist

- [ ] SLZB-06 HTTP endpoints accessed over local network (no secrets in URL)
- [ ] SLZB-06 credentials (if web UI has login) — stored encrypted if needed
- [ ] Auto-discovery does NOT auto-register devices — always requires explicit admin action
- [ ] Firmware mode detection is read-only — Attraccess NEVER auto-switches firmware (destructive to Zigbee)
- [ ] All API endpoints require `@Auth('canManageResources')`
- [ ] Health monitoring does not expose SLZB-06 internal data in logs beyond model/firmware version
- [ ] SLZB-06 web UI password (if configured) handled securely

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/thread/slzb06.service.ts` |
| **Create** | `apps/api/src/matter/thread/slzb06.controller.ts` |
| **Create** | `apps/api/src/matter/thread/dto/register-slzb06.dto.ts` |
| **Create** | `apps/api/src/matter/thread/slzb06.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add SLZB-06 service + controller) |

---

## Definition of Done

- [ ] SLZB-06 discoverable on network (manual IP entry + optional mDNS scan)
- [ ] Device info readable (model, firmware, chip, mode)
- [ ] Thread RCP mode detection works
- [ ] Register creates TBR entity with correct OTBR radio URL
- [ ] Non-Thread-mode devices get instructions, not auto-switched
- [ ] Health monitoring runs every 5 minutes
- [ ] All unit tests pass
