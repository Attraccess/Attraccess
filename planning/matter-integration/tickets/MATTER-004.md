# MATTER-004: MatterModule & ControllerService

**Priority:** P0 — Core
**Dependencies:** MATTER-001 (entities must exist)
**Parallel with:** MATTER-002, MATTER-003, MATTER-005
**Estimated scope:** ~250 lines across 4 files

---

## Goal

Create the NestJS `MatterModule` and the `MatterControllerService` that manages the Matter controller lifecycle — initializing the controller on startup, creating/loading the fabric, and shutting down gracefully.

---

## Context for the Agent

### What this does
The Attraccess API server acts as a **Matter controller** (commissioner). This service manages:
- Creating a Matter `Environment` and `ServerNode` from `@matter/main`
- Generating or loading the fabric identity (root cert + operational key) on first/subsequent boots
- Providing the controller instance to other services for commissioning/commands
- Graceful shutdown

### Existing module pattern — `MqttModule`
**File:** `apps/api/src/mqtt/mqtt.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { MqttServerController } from './servers/mqtt-server.controller';
import { MqttServerService } from './servers/mqtt-server.service';
import { MqttClientService } from './mqtt-client.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [TypeOrmModule.forFeature([MqttServer]), ConfigModule],
  controllers: [MqttServerController],
  providers: [MqttServerService, MqttClientService],
  exports: [MqttClientService],
})
export class MqttModule {}
```

### AppModule registration
**File:** `apps/api/src/app/app.module.ts`
New modules are added to the `imports` array alongside existing modules like `AttractapModule`, `MqttModule`, etc.

### Encryption pattern
The `EncryptionService` from `apps/api/src/encryption/` encrypts/decrypts sensitive data (used for MQTT passwords, NFC keys). Import `EncryptionModule` to get access.

### Entity references
- `MatterFabric` entity — stores fabric identity (from MATTER-001)
- `MatterDevice` entity — stores device info (from MATTER-001)

---

## Specification

### 1. Create Matter configuration

**File:** `apps/api/src/matter/matter.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export interface MatterConfigType {
  vendorId: number;
  storagePath: string;
  port: number;
  fabricLabel: string;
}

export default registerAs('matter', (): MatterConfigType => ({
  vendorId: parseInt(process.env.MATTER_VENDOR_ID || '0xFFF1', 16),
  storagePath: process.env.MATTER_STORAGE_PATH || './storage/matter',
  port: parseInt(process.env.MATTER_PORT || '5540', 10),
  fabricLabel: process.env.MATTER_FABRIC_LABEL || 'Attraccess',
}));
```

### 2. Create MatterControllerService

**File:** `apps/api/src/matter/matter-controller.service.ts`

This is the core service. It must:

**Lifecycle:**
- `onModuleInit()`:
  1. Create `storage/matter/` directory if it doesn't exist (use `fs.mkdirSync` with `recursive: true`, mode `0o700`)
  2. Initialize matter.js `Environment` (the top-level matter.js entry point)
  3. Load existing fabric from `MatterFabric` entity, or create new one on first boot
  4. If creating new fabric: generate root cert + operational key, encrypt, save to `MatterFabric` entity
  5. Start the Matter controller node
  6. Log: "Matter controller initialized with fabric {fabricId}"
- `onModuleDestroy()`:
  1. Stop the Matter controller gracefully
  2. Close all connections
  3. Log: "Matter controller shut down"

**Methods to expose:**
- `getController()`: Returns the initialized controller instance (used by commissioning, command, subscription services)
- `isReady(): boolean`: Whether the controller is initialized and ready
- `getFabricInfo(): { fabricId: string, vendorId: number, label: string }`: Public fabric metadata (no secrets)

**Error handling:**
- If Matter controller fails to initialize, log the error but do NOT crash the application — other features should still work
- Set a `ready` flag to false; services that depend on Matter should check this

**Important notes on matter.js API:**
- The exact API may vary by version. The general pattern is:
  ```typescript
  import { Environment, StorageService } from "@matter/main";
  import { CommissioningController } from "@matter/main";
  ```
- matter.js uses a file-based storage by default in the configured storage path
- The controller needs a `vendorId` — use `0xFFF1` (test vendor) for development

### 3. Create MatterModule

**File:** `apps/api/src/matter/matter.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MatterFabric, MatterDevice } from '@attraccess/database-entities';
import { MatterControllerService } from './matter-controller.service';
import matterConfig from './matter.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatterFabric, MatterDevice]),
    ConfigModule.forFeature(matterConfig),
  ],
  providers: [MatterControllerService],
  exports: [MatterControllerService],
})
export class MatterModule {}
```

**Note:** This module will grow as other tickets add services and controllers. For now, just the controller service.

### 4. Register in AppModule

**File:** `apps/api/src/app/app.module.ts`

Add `MatterModule` to the imports array:
```typescript
import { MatterModule } from '../matter/matter.module';

@Module({
  imports: [
    // ... existing imports ...
    MatterModule,
  ],
})
```

### 5. Add storage directory to .gitignore

**File:** `.gitignore`

Add:
```
storage/matter/
```

---

## Test Plan

```bash
# 1. Verify the module compiles
pnpm nx build api --no-cache

# 2. Start the API and check logs
pnpm nx serve api
# Look for: "Matter controller initialized with fabric ..."
# Should NOT see: any errors about Matter
# Should NOT see: the application crashing

# 3. Restart the API — fabric should be reloaded, not recreated
pnpm nx serve api
# Look for: same fabric ID as before (loaded from DB)

# 4. Verify storage directory
ls -la storage/matter/
# Should exist with 0700 permissions

# 5. Run unit test
pnpm nx test api --testFile=apps/api/src/matter/matter-controller.service.spec.ts --no-cache
```

**Unit tests to write:** `apps/api/src/matter/matter-controller.service.spec.ts`

1. `isReady()` returns false before init, true after init
2. `getFabricInfo()` returns fabric ID and label (no secrets)
3. First boot creates a new fabric record in the database
4. Second boot loads existing fabric (verify by checking the fabric count doesn't increase)
5. `onModuleDestroy()` sets `isReady()` to false

**Note:** For unit tests, mock the matter.js `Environment` — don't start a real Matter controller in tests. Use `jest.mock('@matter/main')`.

---

## Security Checklist

- [ ] `storage/matter/` created with mode `0o700` (owner-only access)
- [ ] `storage/matter/` added to `.gitignore`
- [ ] Fabric private keys encrypted via `EncryptionService` before saving to `MatterFabric`
- [ ] `getFabricInfo()` returns ONLY public metadata — no certificates or keys
- [ ] No fabric credentials in logs (log fabric ID only, never cert/key content)
- [ ] If initialization fails, the error is logged but the application continues running
- [ ] `MATTER_VENDOR_ID` default is `0xFFF1` (test vendor) — documented that production should use a CSA-assigned ID

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MATTER_VENDOR_ID` | `0xFFF1` | CSA vendor ID (hex). Test vendor for dev. |
| `MATTER_STORAGE_PATH` | `./storage/matter` | File storage for matter.js internal state |
| `MATTER_PORT` | `5540` | UDP port for Matter CASE/PASE sessions |
| `MATTER_FABRIC_LABEL` | `Attraccess` | Human-readable fabric name |

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter.module.ts` |
| **Create** | `apps/api/src/matter/matter-controller.service.ts` |
| **Create** | `apps/api/src/matter/matter.config.ts` |
| **Create** | `apps/api/src/matter/matter-controller.service.spec.ts` |
| **Modify** | `apps/api/src/app/app.module.ts` (add MatterModule import) |
| **Modify** | `.gitignore` (add storage/matter/) |

---

## Definition of Done

- [ ] `MatterModule` registered in `AppModule`
- [ ] Controller initializes on startup without crashing the app
- [ ] Fabric persisted in `MatterFabric` entity with encrypted keys
- [ ] Fabric reloaded on restart (same fabric ID)
- [ ] `isReady()` correctly reflects controller state
- [ ] `getFabricInfo()` exposes no secrets
- [ ] `storage/matter/` created with correct permissions
- [ ] Unit tests pass
- [ ] Application starts and other features work even if Matter init fails
