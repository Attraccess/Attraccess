# MATTER-005: Matter CRUD API & Device Management

**Priority:** P0 — Core
**Dependencies:** MATTER-001 (entities), MATTER-004 (module exists)
**Parallel with:** MATTER-003, MATTER-006, MATTER-007
**Estimated scope:** ~200 lines across 3 files

---

## Goal

Create the REST API for listing, reading, updating, and deleting Matter devices. This is the basic management layer — no commissioning logic (that's MATTER-006), just CRUD on existing device records.

---

## Context for the Agent

### Existing controller pattern — `MqttServerController`
```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';

@ApiTags('MQTT')
@Auth('canManageResources')
@Controller('mqtt/servers')
export class MqttServerController {
  constructor(private readonly mqttServerService: MqttServerService) {}

  @Get()
  @ApiOperation({ summary: 'Get all MQTT servers', operationId: 'mqttServersGetAll' })
  @ApiResponse({ status: 200, type: [MqttServer] })
  async getAll(): Promise<MqttServer[]> { ... }

  @Get(':id')
  @ApiOperation({ summary: 'Get MQTT server by ID', operationId: 'mqttServersGetOneById' })
  async getOneById(@Param('id', ParseIntPipe) id: number): Promise<MqttServer> { ... }
}
```

### Auth pattern
- `@Auth('canManageResources')` — requires the specified system permission
- For Matter devices, use the same permission since managing devices is a resource management activity
- The `Auth` decorator is imported from `@attraccess/plugins-backend-sdk`

### Entity references
- `MatterDevice` entity from MATTER-001 — has `@Exclude()` on `commissioningData`
- `MatterFabric` entity — not exposed via this API directly

### Generated API client
After creating controller endpoints with Swagger decorators, the OpenAPI spec must be regenerated:
```bash
pnpm nx run react-query-client:generate
```
This generates typed React Query hooks in `libs/react-query-client/`.

---

## Specification

### 1. Create MatterDeviceService

**File:** `apps/api/src/matter/matter-device.service.ts`

Methods:
- `findAll(): Promise<MatterDevice[]>` — return all devices, load `fabric` relation
- `findOne(id: number): Promise<MatterDevice>` — return single device with relations, throw `NotFoundException` if not found
- `update(id: number, dto: UpdateMatterDeviceDto): Promise<MatterDevice>` — update name only (other fields are set by commissioning)
- `remove(id: number): Promise<void>` — delete device record (note: actual decommissioning is in MATTER-006; this is just DB cleanup)

**Update DTO:** Only `name` is user-editable.

```typescript
export class UpdateMatterDeviceDto {
  @ApiProperty({ description: 'Friendly name for the device', example: 'Front Door Lock' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
```

### 2. Create MatterDeviceController

**File:** `apps/api/src/matter/matter-device.controller.ts`

| Method | Path | Operation ID | Description |
|--------|------|-------------|-------------|
| GET | `/api/matter/devices` | `matterDevicesGetAll` | List all devices |
| GET | `/api/matter/devices/:id` | `matterDevicesGetOneById` | Get single device |
| PUT | `/api/matter/devices/:id` | `matterDevicesUpdateOne` | Update device name |
| GET | `/api/matter/health` | `matterHealthCheck` | Controller health status |

**Guard:** All endpoints require `@Auth('canManageResources')`

**Health endpoint response:**
```typescript
{
  controllerReady: boolean;
  fabricId: string | null;
  fabricLabel: string | null;
  deviceCount: number;
  devicesOnline: number;
}
```

**Important:** The `MatterDevice` entity has `@Exclude()` on `commissioningData`, so it won't appear in responses automatically. But verify this works with the serialization interceptor.

### 3. Register in MatterModule

Update `apps/api/src/matter/matter.module.ts`:
- Add `MatterDeviceService` to providers
- Add `MatterDeviceController` to controllers
- Import `EncryptionModule` if needed

### 4. Create DTOs

**File:** `apps/api/src/matter/dto/update-matter-device.dto.ts`

### 5. Regenerate API client

After creating the controller, regenerate:
```bash
pnpm nx run react-query-client:generate
```

---

## Test Plan

```bash
# 1. Verify compile
pnpm nx build api --no-cache

# 2. Start API and test endpoints manually
pnpm nx serve api

# Test with curl:
# List devices (should return empty array initially)
curl -s http://localhost:3000/api/matter/devices -H "Cookie: <session>" | jq

# Health check
curl -s http://localhost:3000/api/matter/health -H "Cookie: <session>" | jq

# 3. Run unit tests
pnpm nx test api --testFile=apps/api/src/matter/matter-device.service.spec.ts --no-cache
```

**Unit tests:** `apps/api/src/matter/matter-device.service.spec.ts`

1. `findAll()` returns empty array when no devices exist
2. `findAll()` returns devices with `fabric` relation loaded
3. `findOne()` returns device by ID
4. `findOne()` throws `NotFoundException` for non-existent ID
5. `remove()` deletes device record and returns void
6. `update()` changes name, preserves other fields
7. `update()` throws `NotFoundException` for non-existent ID
8. `remove()` deletes the device record

**Use TypeORM testing patterns:** Mock the repository with `getRepositoryToken(MatterDevice)`.

---

## Security Checklist

- [ ] All endpoints guarded with `@Auth('canManageResources')`
- [ ] `commissioningData` excluded from all responses (via `@Exclude()` decorator)
- [ ] `rootCertificate` and `operationalKey` from MatterFabric never exposed
- [ ] Health endpoint returns only public metadata
- [ ] `operationId` values follow existing naming convention (`matterDevices*`)
- [ ] DELETE endpoint only removes DB record — actual decommissioning (removing from fabric) is a separate operation in MATTER-006

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `apps/api/src/matter/matter-device.service.ts` |
| **Create** | `apps/api/src/matter/matter-device.controller.ts` |
| **Create** | `apps/api/src/matter/dto/update-matter-device.dto.ts` |
| **Create** | `apps/api/src/matter/matter-device.service.spec.ts` |
| **Modify** | `apps/api/src/matter/matter.module.ts` (add service + controller) |

---

## Definition of Done

- [ ] All 4 API endpoints respond correctly
- [ ] `@Exclude()` fields not in responses
- [ ] Health endpoint shows controller status
- [ ] All unit tests pass
- [ ] OpenAPI spec generated with correct operation IDs
- [ ] React Query hooks generated in `libs/react-query-client/`
