# MATTER-019: Thread Border Router Entity & OTBR Client

**Priority:** P0 — Thread Foundation
**Dependencies:** MATTER-001 (entities pattern), MATTER-004 (MatterModule exists)
**Parallel with:** MATTER-020, all non-Thread tickets
**Estimated scope:** ~400 lines across 6 files

---

## Goal

Create the data model for Thread Border Routers and a client service for the OpenThread Border Router (OTBR) REST API. This enables Attraccess to manage Thread networks — required for Matter-over-Thread devices like the Nuki Smart Lock 4.0 Pro.

---

## Context for the Agent

### Why Thread Border Routers are needed
Matter devices can communicate over Wi-Fi, Ethernet, or **Thread**. Thread is a low-power mesh networking protocol (IEEE 802.15.4) that requires a **Thread Border Router (TBR)** to bridge the Thread mesh to the IP network. Without a TBR, the Attraccess server cannot reach Thread devices.

### Architecture
```
[Nuki Lock] ──Thread mesh──► [SLZB-06 RCP] ──TCP──► [OTBR container] ──IPv6──► [Attraccess API]
                                                          │
                                                     REST API :8081
                                                          │
                                                    [MatterModule]
```

- **SLZB-06**: Hardware radio (Thread RCP mode) — provides the 802.15.4 radio
- **OTBR (OpenThread Border Router)**: Software running in Docker — manages the Thread network, routes IPv6, publishes mDNS
- **Attraccess**: Talks to OTBR via REST API (port 8081) for Thread network management, and to Matter devices via the controller (routed through OTBR)

### OTBR REST API (port 8081)
The OTBR exposes a comprehensive REST API:

**Node state:**
- `GET /node` — device info
- `GET /node/state` — Thread state: disabled, detached, child, router, leader
- `PUT /node/state` — change state (enable/disable)

**Dataset management (the Thread network config):**
- `GET /node/dataset/active` — returns: networkKey, networkName, extPanId, meshLocalPrefix, panId, channel, pskc, securityPolicy, channelMask, activeTimestamp
- `PUT /node/dataset/active` — create/update Thread network configuration

**Diagnostics:**
- `GET /node/ext-address` — IEEE 802.15.4 extended address
- `GET /node/rloc16` — routing locator
- `GET /node/leader-data` — partition/leader info
- `GET /node/num-of-router` — router count in mesh
- `GET /node/ba-id` — Border Agent ID
- `GET /node/coprocessor/version` — RCP firmware version

### Existing patterns
- Entity pattern: see `MqttServer` entity in `libs/database-entities/src/lib/entities/mqttServer.entity.ts`
- Service pattern: see `MqttClientService` in `apps/api/src/mqtt/mqtt-client.service.ts`
- Encryption: `EncryptionService` for sensitive fields

---

## Specification

### 1. Create `ThreadBorderRouter` entity

**File:** `libs/database-entities/src/lib/entities/threadBorderRouter.entity.ts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PK, auto-increment | |
| `name` | text | not null | User-assigned friendly name (e.g., "Office TBR") |
| `type` | text | not null, enum | `'otbr'` or `'slzb06'` — extensible for future TBR types |
| `host` | text | not null | IP address or hostname of OTBR REST API |
| `port` | integer | not null, default 8081 | OTBR REST API port |
| `rcpHost` | text | nullable | SLZB-06 IP (for network-attached RCP) — null if USB |
| `rcpPort` | integer | nullable | SLZB-06 serial port (typically 6638) |
| `threadNetworkName` | text | nullable | Thread network name (from dataset) |
| `threadChannel` | integer | nullable | 802.15.4 channel (11-26) |
| `threadPanId` | text | nullable | PAN ID (hex string) |
| `threadExtPanId` | text | nullable | Extended PAN ID (hex string) |
| `threadNetworkKey` | text | nullable | Thread network master key — **ENCRYPTED, @Exclude()** |
| `threadDataset` | text | nullable | Full operational dataset TLV (hex) — **ENCRYPTED, @Exclude()** |
| `state` | text | not null, default 'unknown' | Current OTBR state: disabled, detached, child, router, leader, unknown |
| `isOnline` | boolean | default false | |
| `lastSeen` | datetime | nullable | |
| `borderAgentId` | text | nullable | OTBR Border Agent ID |
| `rcpFirmwareVersion` | text | nullable | RCP chip firmware version |
| `createdAt` | datetime | auto | |
| `updatedAt` | datetime | auto | |

**Security:** `threadNetworkKey` and `threadDataset` are critical secrets — encrypted at rest via `EncryptionService`, excluded from API responses via `@Exclude()`.

### 2. Create migration

**File:** `apps/api/src/database/migrations/<timestamp>-add-thread-border-router.ts`

Single table creation with all columns.

### 3. Update entities index

Add `ThreadBorderRouter` to `libs/database-entities/src/lib/entities-index.ts`.

### 4. Create OtbrClientService

**File:** `apps/api/src/matter/thread/otbr-client.service.ts`

HTTP client for the OTBR REST API. Uses `axios` (already in the project for HTTP flow nodes).

```typescript
@Injectable()
export class OtbrClientService {
  // Core state
  async getNodeState(tbrId: number): Promise<OtbrNodeState>
  async setNodeState(tbrId: number, state: 'enable' | 'disable'): Promise<void>

  // Dataset management
  async getActiveDataset(tbrId: number): Promise<OtbrDataset>
  async setActiveDataset(tbrId: number, dataset: Partial<OtbrDataset>): Promise<void>
  async createThreadNetwork(tbrId: number, config: CreateThreadNetworkDto): Promise<OtbrDataset>

  // Diagnostics
  async getNodeInfo(tbrId: number): Promise<OtbrNodeInfo>
  async getBorderAgentId(tbrId: number): Promise<string>
  async getRcpVersion(tbrId: number): Promise<string>
  async getRouterCount(tbrId: number): Promise<number>

  // Health check
  async checkHealth(tbrId: number): Promise<OtbrHealthStatus>
}
```

**Interfaces:**

```typescript
interface OtbrNodeState {
  state: 'disabled' | 'detached' | 'child' | 'router' | 'leader';
}

interface OtbrDataset {
  activeTimestamp: number;
  networkKey: string;      // hex, 32 chars
  networkName: string;     // 1-16 chars
  extPanId: string;        // hex, 16 chars
  meshLocalPrefix: string; // IPv6 prefix
  panId: number;           // 0x0000-0xFFFF
  channel: number;         // 11-26
  pskc: string;            // hex, 32 chars
  securityPolicy: {
    rotationTime: number;
    obtainNetworkKey: boolean;
    nativeCommissioning: boolean;
    routers: boolean;
    externalCommissioning: boolean;
  };
  channelMask: number;
}

interface OtbrNodeInfo {
  extAddress: string;
  rloc16: string;
  leaderData: {
    partitionId: number;
    weighting: number;
    dataVersion: number;
    stableDataVersion: number;
    leaderRouterId: number;
  };
  numOfRouter: number;
  borderAgentId: string;
  rcpVersion: string;
}

interface OtbrHealthStatus {
  reachable: boolean;
  state: string;
  hasActiveDataset: boolean;
  networkName: string | null;
  routerCount: number;
  rcpVersion: string | null;
}
```

**Implementation notes:**
- Each method loads the `ThreadBorderRouter` entity to get host/port
- HTTP requests to `http://{host}:{port}/{path}`
- Timeout: 5 seconds per request
- Error handling: OTBR unreachable → update `isOnline = false`
- On success: update `isOnline = true`, `lastSeen = now`
- `threadNetworkKey` decrypted from entity before sending to OTBR; encrypted before saving

### 5. Create Thread network management service

**File:** `apps/api/src/matter/thread/thread-network.service.ts`

Higher-level service for Thread network lifecycle:

```typescript
@Injectable()
export class ThreadNetworkService {
  // Create a new Thread network on a TBR
  async createNetwork(tbrId: number, dto: CreateThreadNetworkDto): Promise<ThreadBorderRouter>

  // Join an existing Thread network (apply dataset from another TBR)
  async joinNetwork(tbrId: number, dataset: string): Promise<ThreadBorderRouter>

  // Get the dataset for sharing with Matter controller
  async getDatasetForCommissioning(tbrId: number): Promise<string>

  // Sync state from OTBR to database
  async syncState(tbrId: number): Promise<ThreadBorderRouter>

  // Get the Thread credential set needed by matter.js for commissioning Thread devices
  async getThreadCredentials(tbrId: number): Promise<ThreadCredentials>
}
```

**`CreateThreadNetworkDto`:**
```typescript
export class CreateThreadNetworkDto {
  @ApiProperty({ description: 'Thread network name (1-16 characters)', example: 'Attraccess-Thread' })
  @IsString() @Length(1, 16)
  networkName!: string;

  @ApiProperty({ description: '802.15.4 channel (11-26)', example: 15, required: false })
  @IsOptional() @IsInt() @Min(11) @Max(26)
  channel?: number; // OTBR picks best channel if omitted
}
```

### 6. Create TBR CRUD controller

**File:** `apps/api/src/matter/thread/thread-border-router.controller.ts`

| Method | Path | Operation ID | Description |
|--------|------|-------------|-------------|
| GET | `/api/matter/thread/border-routers` | `threadBorderRoutersGetAll` | List all TBRs |
| GET | `/api/matter/thread/border-routers/:id` | `threadBorderRoutersGetOne` | Get TBR details |
| POST | `/api/matter/thread/border-routers` | `threadBorderRoutersCreate` | Register a TBR |
| PUT | `/api/matter/thread/border-routers/:id` | `threadBorderRoutersUpdate` | Update TBR config |
| DELETE | `/api/matter/thread/border-routers/:id` | `threadBorderRoutersDelete` | Remove TBR |
| POST | `/api/matter/thread/border-routers/:id/create-network` | `threadBorderRoutersCreateNetwork` | Create Thread network |
| GET | `/api/matter/thread/border-routers/:id/status` | `threadBorderRoutersGetStatus` | Live health check |
| POST | `/api/matter/thread/border-routers/:id/sync` | `threadBorderRoutersSync` | Sync state from OTBR |

**Guard:** `@Auth('canManageResources')` on all endpoints.

**Create TBR DTO:**
```typescript
export class CreateThreadBorderRouterDto {
  @IsString() @IsNotEmpty()
  name!: string;

  @IsEnum(['otbr', 'slzb06'])
  type!: 'otbr' | 'slzb06';

  @IsString() @IsNotEmpty()
  host!: string; // OTBR host

  @IsInt() @IsOptional()
  port?: number; // default 8081

  @IsString() @IsOptional()
  rcpHost?: string; // SLZB-06 host (for display/monitoring)

  @IsInt() @IsOptional()
  rcpPort?: number; // SLZB-06 serial-over-TCP port
}
```

### 7. Register in MatterModule

Add all new services and controller. Create `apps/api/src/matter/thread/` directory.

---

## Test Plan

```bash
pnpm nx test api --testFile=apps/api/src/matter/thread/otbr-client.service.spec.ts --no-cache
pnpm nx test api --testFile=apps/api/src/matter/thread/thread-network.service.spec.ts --no-cache
```

**OtbrClientService tests** (mock HTTP):

1. `getNodeState()` — parses OTBR response, returns typed state
2. `getActiveDataset()` — parses all dataset fields
3. `setActiveDataset()` — sends correct JSON body
4. `createThreadNetwork()` — POST to OTBR with network config, returns dataset
5. `checkHealth()` — returns reachable=true when OTBR responds
6. `checkHealth()` — returns reachable=false on connection timeout
7. Connection failure → updates `isOnline = false` in entity
8. Success → updates `isOnline = true`, `lastSeen`

**ThreadNetworkService tests:**

9. `createNetwork()` — creates dataset on OTBR, encrypts networkKey, saves to entity
10. `getDatasetForCommissioning()` — returns hex-encoded dataset TLV
11. `syncState()` — reads OTBR state and updates entity

**Controller tests:**

12. All endpoints return correct status codes
13. Create TBR validates host/port
14. Delete TBR removes record
15. `@Exclude()` fields not in responses

---

## Security Checklist

- [ ] `threadNetworkKey` encrypted at rest via `EncryptionService` — `@Exclude()` in API responses
- [ ] `threadDataset` encrypted at rest — `@Exclude()` in API responses
- [ ] Thread network key NEVER logged (not even at debug level)
- [ ] OTBR REST API communication is over local network only (no TLS needed for localhost, but document that remote OTBR should use TLS)
- [ ] All TBR endpoints require `@Auth('canManageResources')`
- [ ] Dataset sent to OTBR over HTTP — acceptable for local network; document risk for remote setups
- [ ] `pskc` (Pre-Shared Key for Commissioner) encrypted same as network key
- [ ] Border Agent ID is public metadata — safe to expose
- [ ] RCP firmware version is public metadata — safe to expose

### Thread Network Key Threat
The Thread network key is the **master secret** for the entire Thread mesh. With it, any 802.15.4 radio within range can join the network and intercept all traffic. This is the most sensitive credential in the Thread integration — treat it with the same care as the Matter fabric private key.

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `libs/database-entities/src/lib/entities/threadBorderRouter.entity.ts` |
| **Create** | `apps/api/src/database/migrations/<timestamp>-add-thread-border-router.ts` |
| **Create** | `apps/api/src/matter/thread/otbr-client.service.ts` |
| **Create** | `apps/api/src/matter/thread/thread-network.service.ts` |
| **Create** | `apps/api/src/matter/thread/thread-border-router.controller.ts` |
| **Create** | `apps/api/src/matter/thread/dto/create-thread-border-router.dto.ts` |
| **Create** | `apps/api/src/matter/thread/dto/create-thread-network.dto.ts` |
| **Create** | `apps/api/src/matter/thread/otbr-client.service.spec.ts` |
| **Create** | `apps/api/src/matter/thread/thread-network.service.spec.ts` |
| **Modify** | `libs/database-entities/src/lib/entities-index.ts` (add ThreadBorderRouter) |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add thread services + controller) |

---

## Definition of Done

- [ ] `ThreadBorderRouter` entity created with encrypted sensitive fields
- [ ] Migration runs cleanly
- [ ] OtbrClientService can read/write OTBR state and datasets
- [ ] ThreadNetworkService creates networks and syncs state
- [ ] CRUD API endpoints work with proper auth
- [ ] Network key and dataset never in API responses or logs
- [ ] All unit tests pass
- [ ] Entity exported from `@attraccess/database-entities`
