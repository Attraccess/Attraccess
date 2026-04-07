# MATTER-001: Database Entities & Migrations

**Priority:** P0 — Foundation
**Dependencies:** None
**Parallel with:** MATTER-002, MATTER-003
**Estimated scope:** ~200 lines of code across 4 files

---

## Goal

Create the `MatterFabric` and `MatterDevice` TypeORM entities and their SQLite migrations. These are the persistent data layer for the entire Matter integration.

---

## Context for the Agent

### Project structure
- **Monorepo** using NX + pnpm
- **Backend:** NestJS app in `apps/api/`
- **Database:** SQLite via TypeORM
- **Entities live in:** `libs/database-entities/src/lib/entities/`
- **Entities index:** `libs/database-entities/src/lib/entities-index.ts` — all entities must be exported here
- **Migrations live in:** `apps/api/src/database/migrations/`
- **Entity pattern:** TypeORM decorators + `@nestjs/swagger` `@ApiProperty` decorators + `class-transformer` `@Exclude` for sensitive fields

### Existing entity to follow as pattern — `MqttServer`
**File:** `libs/database-entities/src/lib/entities/mqttServer.entity.ts`
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

@Entity()
export class MqttServer {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the MQTT server', example: 1 })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'Friendly name for the MQTT server', example: 'Workshop MQTT Server' })
  name!: string;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'MQTT server hostname/IP', example: 'mqtt.example.com' })
  host!: string;

  @Column({ nullable: true, type: 'text' })
  @ApiProperty({ description: 'Optional authentication password', required: false, writeOnly: true })
  @Exclude()
  password!: string | null;

  @CreateDateColumn()
  @ApiProperty({ description: 'When the MQTT server was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the MQTT server was last updated' })
  updatedAt!: Date;
}
```

### Existing migration pattern
**File:** `apps/api/src/database/migrations/1757779856387-settings.ts`
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Settings1757779856387 implements MigrationInterface {
  name = 'Settings1757779856387';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "setting" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "parent" text NOT NULL, "key" text NOT NULL, "value" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "settings_identifier" UNIQUE ("parent", "key"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "setting"`);
  }
}
```

---

## Specification

### 1. Create `MatterFabric` entity

**File:** `libs/database-entities/src/lib/entities/matterFabric.entity.ts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PK, auto-increment | |
| `fabricId` | text | unique, not null | Matter fabric ID string |
| `rootCertificate` | text | not null | PEM, encrypted at rest — `@Exclude()` |
| `operationalKey` | text | not null | PEM private key, encrypted at rest — `@Exclude()` |
| `vendorId` | integer | not null | CSA vendor ID (default test: 0xFFF1) |
| `label` | text | not null, default "Attraccess" | Human name for the fabric |
| `createdAt` | datetime | auto | |
| `updatedAt` | datetime | auto | |

- `rootCertificate` and `operationalKey` MUST have `@Exclude()` decorator — these are secrets that must never appear in API responses
- Add `@ApiProperty({ writeOnly: true })` on excluded fields

### 2. Create `MatterDevice` entity

**File:** `libs/database-entities/src/lib/entities/matterDevice.entity.ts`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | integer | PK, auto-increment | |
| `name` | text | not null | User-assigned friendly name |
| `nodeId` | text | not null | Matter node ID on fabric |
| `vendorId` | integer | not null | Device vendor ID |
| `vendorName` | text | nullable | e.g., "Nuki" |
| `productId` | integer | not null | Device product ID |
| `productName` | text | nullable | e.g., "Smart Lock 4.0 Pro" |
| `deviceType` | integer | not null | Matter device type ID (e.g., 0x000A for door lock) |
| `deviceTypeName` | text | not null | e.g., "Door Lock" |
| `serialNumber` | text | nullable | |
| `commissioningData` | text | not null | Encrypted JSON — `@Exclude()` |
| `endpoints` | text | not null, default '[]' | JSON — endpoint/cluster map |
| `lastSeen` | datetime | nullable | |
| `isOnline` | boolean | default false | |
| `fabricId` | integer | FK → MatterFabric, not null | |
| `createdAt` | datetime | auto | |
| `updatedAt` | datetime | auto | |

**Relations:**
- `@ManyToOne(() => MatterFabric)` on `fabricId`
- `@JoinColumn()` on FK field

**No resource FK.** Device-resource relationships are expressed entirely through flow nodes (e.g., a Matter Event node on a resource's flow references a device by ID). This keeps all control/state logic in the flow system.

### 3. Update entities index

**File:** `libs/database-entities/src/lib/entities-index.ts`

- Import `MatterFabric` and `MatterDevice`
- Add both to the named exports
- Add both to the `entities` object

### 5. Create migration

**File:** `apps/api/src/database/migrations/<timestamp>-add-matter-entities.ts`

Use current timestamp for the migration name. Create both tables in a single migration. Include:
- `matter_fabric` table
- `matter_device` table with foreign key to `matter_fabric`
- Index on `matter_device.fabricId`

---

## Test Plan

```bash
# 1. Verify TypeScript compiles
pnpm nx build database-entities --no-cache

# 2. Run the migration (starts API which runs migrations on boot)
pnpm nx serve api  # Verify no migration errors in console output

# 3. Verify tables exist
sqlite3 storage/attraccess.sqlite ".tables" | grep matter

# 4. Verify table schemas
sqlite3 storage/attraccess.sqlite ".schema matter_fabric"
sqlite3 storage/attraccess.sqlite ".schema matter_device"

# 5. Verify foreign keys
sqlite3 storage/attraccess.sqlite "PRAGMA foreign_key_list(matter_device);"
```

**Manual verification:**
- Import `MatterFabric` and `MatterDevice` from `@attraccess/database-entities` in a test file — should resolve
- Confirm `@Exclude()` fields: create a `MatterFabric` instance, serialize with `class-transformer` → `rootCertificate` and `operationalKey` should be absent

---

## Security Checklist

- [ ] `rootCertificate` and `operationalKey` on `MatterFabric` have `@Exclude()` decorator
- [ ] `commissioningData` on `MatterDevice` has `@Exclude()` decorator
- [ ] Sensitive fields have `writeOnly: true` in `@ApiProperty`
- [ ] No default values expose secrets
- [ ] Migration uses `down()` that cleanly drops tables (reversible)

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **Create** | `libs/database-entities/src/lib/entities/matterFabric.entity.ts` |
| **Create** | `libs/database-entities/src/lib/entities/matterDevice.entity.ts` |
| **Modify** | `libs/database-entities/src/lib/entities-index.ts` (add exports) |
| **Create** | `apps/api/src/database/migrations/<timestamp>-add-matter-entities.ts` |

---

## Definition of Done

- [ ] Both entities compile and are exported from `@attraccess/database-entities`
- [ ] Migration runs without errors on a fresh database
- [ ] Migration runs without errors on an existing database (non-destructive)
- [ ] `@Exclude()` on all sensitive fields
- [ ] OpenAPI spec regenerated — MatterFabric and MatterDevice appear as schemas (without excluded fields)
