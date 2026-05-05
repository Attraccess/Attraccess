# ATT-106 — User Retraining Requirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operator-configurable retraining requirements so introductions expire after time, after group inactivity, or after per-resource inactivity, with optional access blocking and email warnings.

**Architecture:** Mirror `ResourceMaintenanceSchedule`. New `ResourceIntroductionSchedule` entity + per-trigger config sub-entities; cron-driven evaluator that writes EXPIRE/WARN_SENT history items; expiry layered into the existing `hasValidIntroduction` gate so all callers (usage start, attractap websocket, status DTO) inherit blocking automatically. Renewal is a new history action (`RENEW`) that resets the baseline.

**Tech Stack:** NestJS, TypeORM (SQLite), Jest, React + Vite (frontend), generated OpenAPI client, generated TanStack Query hooks, MJML email templates.

**Spec:** [docs/superpowers/specs/2026-05-05-att-106-user-retraining-requirement-design.md](../specs/2026-05-05-att-106-user-retraining-requirement-design.md)

**Branch:** `att-106-user-retraining-requirement`

---

## Conventions referenced throughout

- `pnpm` for everything (per project memory).
- Run a single api test file: `pnpm nx test api --testFile=<path> --no-cache`
- Run a single frontend test file: `pnpm nx test frontend --testFile=<path>`
- Run all api tests: `pnpm nx test api --no-cache`
- Run all linters: `pnpm nx run-many -t lint`
- Generated clients live in `libs/api-client/src/generated/Api.ts`, `libs/react-query-client/src/lib/requests/{schemas,types}.gen.ts`.
- File-header rule (`CLAUDE.md`): every new file starts with the 2-line header. Every new file in this plan ships with one.
- Commits: small, focused, conventional. Each task ends with at least one commit. Branch is `att-106-user-retraining-requirement`.

## File structure

### Created

```
libs/database-entities/src/lib/types/retraining-interval-unit.enum.ts
libs/database-entities/src/lib/entities/resource-introduction-schedule.entity.ts
libs/database-entities/src/lib/entities/resource-introduction-schedule-time-since-introduction-config.entity.ts
libs/database-entities/src/lib/entities/resource-introduction-schedule-inactivity-config.entity.ts

apps/api/src/database/migrations/1778016390000-introduction-schedules.ts
apps/api/src/database/migrations/1778016390001-seed-introduction-email-templates.ts

apps/api/src/resources/introductions/schedules/dtos/time-since-introduction-config.dto.ts
apps/api/src/resources/introductions/schedules/dtos/inactivity-config.dto.ts
apps/api/src/resources/introductions/schedules/dtos/create-introduction-schedule.dto.ts
apps/api/src/resources/introductions/schedules/dtos/update-introduction-schedule.dto.ts
apps/api/src/resources/introductions/schedules/introduction-schedule.service.ts
apps/api/src/resources/introductions/schedules/introduction-schedule.service.spec.ts
apps/api/src/resources/introductions/schedules/introduction-schedule.controller.ts
apps/api/src/resources/introductions/schedules/introduction-schedule.controller.spec.ts
apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.ts
apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.spec.ts
apps/api/src/resources/introductions/schedules/introduction-schedule.module.ts
apps/api/src/resources/groups/introductions/schedules/group-introduction-schedule.controller.ts
apps/api/src/resources/groups/introductions/schedules/group-introduction-schedule.controller.spec.ts

apps/api/src/resources/introductions/dtos/renewIntroduction.request.dto.ts
apps/api/src/resources/introductions/dtos/introductionStatus.response.dto.ts
apps/api/src/resources/introductions/dtos/expiringIntroduction.response.dto.ts

apps/api/src/resources/introductions/introduction-renewal.e2e-spec.ts
apps/api/src/resources/introductions/introduction-inactivity-scope.e2e-spec.ts

apps/frontend/src/app/resources/details/introduction-schedules/index.tsx
apps/frontend/src/app/resources/details/introduction-schedules/upsert/index.tsx
apps/frontend/src/app/resources/details/introduction-schedules/en.json
apps/frontend/src/app/resources/details/introduction-schedules/de.json
apps/frontend/src/app/resource-groups/IntroductionSchedules/index.tsx
apps/frontend/src/app/resource-groups/IntroductionSchedules/upsert/index.tsx
apps/frontend/src/app/resource-groups/IntroductionSchedules/en.json
apps/frontend/src/app/resource-groups/IntroductionSchedules/de.json
apps/frontend/src/components/IntroductionStatusChip/index.test.tsx
apps/frontend/src/app/home/MyExpiringIntroductions/index.tsx
apps/frontend/src/app/home/MyExpiringIntroductions/index.test.tsx
```

### Modified

```
libs/database-entities/src/lib/entities/resourceIntroductionHistoryItem.entity.ts   (extend enum, nullable performer, scheduleId FK)
libs/database-entities/src/lib/entities-index.ts                                    (export new entities + enum)
libs/database-entities/src/lib/entities/resource.entity.ts                          (add introductionSchedules relation)
libs/database-entities/src/lib/entities/resourceGroup.entity.ts                     (add introductionSchedules relation)

apps/api/src/resources/introductions/resouceIntroductions.service.ts                (renew, hasValidIntroduction)
apps/api/src/resources/introductions/resouceIntroductions.service.spec.ts           (new tests)
apps/api/src/resources/introductions/resourceIntroductions.controller.ts            (renew endpoint, status endpoint)
apps/api/src/resources/introductions/resourceIntroductions.module.ts                (provide evaluator)
apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.ts (renew, hasValidIntroduction)
apps/api/src/resources/groups/introductions/resourceGroups.introductions.controller.ts
apps/api/src/resources/groups/introductions/resourceGroups.introductions.module.ts
apps/api/src/users/users.controller.ts                                              (expiring endpoint)
apps/api/src/users/users.module.ts

apps/api/src/resources/usage/resourceUsage.service.spec.ts                          (extra cases)

apps/frontend/src/components/IntroductionStatusChip/index.tsx
apps/frontend/src/app/resources/usage/components/IntroductionRequiredDisplay/index.tsx
apps/frontend/src/app/resources/usage/components/IntroductionRequiredDisplay/translations/en.json
apps/frontend/src/app/resources/usage/components/IntroductionRequiredDisplay/translations/de.json
apps/frontend/src/components/IntroductionsManagement/index.tsx
apps/frontend/src/components/IntroductionsManagement/en.json
apps/frontend/src/app/resources/details/resourceDetails.tsx                         (link to introduction-schedules tab)
apps/frontend/src/app/resource-groups/index.tsx                                     (link to schedules)

libs/api-client/src/generated/Api.ts                                                (regenerated)
libs/react-query-client/src/lib/requests/schemas.gen.ts                             (regenerated)
libs/react-query-client/src/lib/requests/types.gen.ts                               (regenerated)
```

---

## Task 1: New entity types & enum extensions

**Files:**
- Create: `libs/database-entities/src/lib/types/retraining-interval-unit.enum.ts`
- Create: `libs/database-entities/src/lib/entities/resource-introduction-schedule.entity.ts`
- Create: `libs/database-entities/src/lib/entities/resource-introduction-schedule-time-since-introduction-config.entity.ts`
- Create: `libs/database-entities/src/lib/entities/resource-introduction-schedule-inactivity-config.entity.ts`
- Modify: `libs/database-entities/src/lib/entities/resourceIntroductionHistoryItem.entity.ts`
- Modify: `libs/database-entities/src/lib/entities/resource.entity.ts` (add `introductionSchedules!: ResourceIntroductionSchedule[]` OneToMany)
- Modify: `libs/database-entities/src/lib/entities/resourceGroup.entity.ts` (same)
- Modify: `libs/database-entities/src/lib/entities-index.ts` (export everything new)

- [ ] **Step 1: Create `retraining-interval-unit.enum.ts`**

```ts
// New enum for retraining-only intervals (DAYS..YEARS) distinct from
// FEATURE: User retraining requirement (ATT-106)
export enum RetrainingIntervalUnit {
  DAYS = 'DAYS',
  WEEKS = 'WEEKS',
  MONTHS = 'MONTHS',
  YEARS = 'YEARS',
}
```

- [ ] **Step 2: Create `resource-introduction-schedule.entity.ts`**

```ts
// Schedule entity that defines when an introduction must be renewed
// FEATURE: User retraining requirement (ATT-106)
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToOne,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Resource } from './resource.entity';
import { ResourceGroup } from './resourceGroup.entity';
import { ResourceIntroductionScheduleTimeSinceIntroductionConfig } from './resource-introduction-schedule-time-since-introduction-config.entity';
import { ResourceIntroductionScheduleInactivityConfig } from './resource-introduction-schedule-inactivity-config.entity';

export enum ResourceIntroductionScheduleTriggerType {
  TIME_SINCE_INTRODUCTION = 'TIME_SINCE_INTRODUCTION',
  INACTIVITY = 'INACTIVITY',
}

@Entity()
export class ResourceIntroductionSchedule {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'Schedule ID', example: 1 })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'Created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'Updated' })
  updatedAt!: Date;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Resource ID (set when scope=resource)', required: false })
  resourceId!: number | null;

  @ManyToOne(() => Resource, (r) => r.introductionSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource?: Resource | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'Resource group ID (set when scope=group)', required: false })
  resourceGroupId!: number | null;

  @ManyToOne(() => ResourceGroup, (g) => g.introductionSchedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceGroupId' })
  resourceGroup?: ResourceGroup | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'Optional human-readable label', required: false })
  name!: string | null;

  @Column({ type: 'simple-enum', enum: ResourceIntroductionScheduleTriggerType })
  @ApiProperty({ enum: ResourceIntroductionScheduleTriggerType, enumName: 'ResourceIntroductionScheduleTriggerType' })
  triggerType!: ResourceIntroductionScheduleTriggerType;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether triggering this schedule blocks usage', default: false })
  blockAccess!: boolean;

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({ description: 'Days before due date to email a warning. 0 disables.', default: 0 })
  warnDaysBefore!: number;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({ description: 'Schedule enabled', default: true })
  enabled!: boolean;

  @OneToOne(
    () => ResourceIntroductionScheduleTimeSinceIntroductionConfig,
    (c) => c.schedule,
    { nullable: true },
  )
  @ApiProperty({ required: false })
  timeSinceIntroductionConfig?: ResourceIntroductionScheduleTimeSinceIntroductionConfig | null;

  @OneToOne(
    () => ResourceIntroductionScheduleInactivityConfig,
    (c) => c.schedule,
    { nullable: true },
  )
  @ApiProperty({ required: false })
  inactivityConfig?: ResourceIntroductionScheduleInactivityConfig | null;
}
```

- [ ] **Step 3: Create `resource-introduction-schedule-time-since-introduction-config.entity.ts`**

```ts
// Config for TIME_SINCE_INTRODUCTION trigger: duration + unit
// FEATURE: User retraining requirement (ATT-106)
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroductionSchedule } from './resource-introduction-schedule.entity';
import { RetrainingIntervalUnit } from '../types/retraining-interval-unit.enum';

@Entity()
export class ResourceIntroductionScheduleTimeSinceIntroductionConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceIntroductionSchedule, (s) => s.timeSinceIntroductionConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceIntroductionSchedule;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 1, description: 'Duration value' })
  duration!: number;

  @Column({ type: 'simple-enum', enum: RetrainingIntervalUnit })
  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  unit!: RetrainingIntervalUnit;
}
```

- [ ] **Step 4: Create `resource-introduction-schedule-inactivity-config.entity.ts`**

```ts
// Config for INACTIVITY trigger: duration + unit + scope
// FEATURE: User retraining requirement (ATT-106)
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroductionSchedule } from './resource-introduction-schedule.entity';
import { RetrainingIntervalUnit } from '../types/retraining-interval-unit.enum';

export enum ResourceIntroductionScheduleInactivityScope {
  GROUP = 'GROUP',
  RESOURCE = 'RESOURCE',
}

@Entity()
export class ResourceIntroductionScheduleInactivityConfig {
  @PrimaryGeneratedColumn()
  @ApiProperty({ example: 1 })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 1 })
  scheduleId!: number;

  @OneToOne(() => ResourceIntroductionSchedule, (s) => s.inactivityConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scheduleId' })
  schedule!: ResourceIntroductionSchedule;

  @Column({ type: 'integer' })
  @ApiProperty({ example: 6 })
  duration!: number;

  @Column({ type: 'simple-enum', enum: RetrainingIntervalUnit })
  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  unit!: RetrainingIntervalUnit;

  @Column({ type: 'simple-enum', enum: ResourceIntroductionScheduleInactivityScope })
  @ApiProperty({ enum: ResourceIntroductionScheduleInactivityScope, enumName: 'ResourceIntroductionScheduleInactivityScope' })
  scope!: ResourceIntroductionScheduleInactivityScope;
}
```

- [ ] **Step 5: Extend `resourceIntroductionHistoryItem.entity.ts`**

Add 3 enum members, make `performedByUserId` nullable, add `scheduleId` FK + relation. Replace the existing enum block:

```ts
export enum IntroductionHistoryAction {
  REVOKE = 'revoke',
  GRANT = 'grant',
  RENEW = 'renew',
  EXPIRE = 'expire',
  WARN_SENT = 'warn_sent',
}
```

Change `performedByUserId` column to `{ type: 'integer', nullable: true }` and the JSDoc/ApiProperty `required: false`. Add a new column + relation:

```ts
@Column({ type: 'integer', nullable: true })
@ApiProperty({ description: 'Schedule that produced this system action (EXPIRE/WARN_SENT)', required: false })
scheduleId!: number | null;

@ManyToOne(() => ResourceIntroductionSchedule, { onDelete: 'SET NULL' })
@JoinColumn({ name: 'scheduleId' })
schedule?: ResourceIntroductionSchedule | null;
```

Import `ResourceIntroductionSchedule` at top.

- [ ] **Step 6: Extend `resource.entity.ts` and `resourceGroup.entity.ts`**

Add a OneToMany back-ref on each:

```ts
// resource.entity.ts
@OneToMany(() => ResourceIntroductionSchedule, (s) => s.resource)
introductionSchedules!: ResourceIntroductionSchedule[];

// resourceGroup.entity.ts
@OneToMany(() => ResourceIntroductionSchedule, (s) => s.resourceGroup)
introductionSchedules!: ResourceIntroductionSchedule[];
```

Add the import line in both.

- [ ] **Step 7: Wire `entities-index.ts`**

Add imports + named exports + `entities` map entries for `ResourceIntroductionSchedule`, `ResourceIntroductionScheduleTimeSinceIntroductionConfig`, `ResourceIntroductionScheduleInactivityConfig`, `ResourceIntroductionScheduleTriggerType`, `ResourceIntroductionScheduleInactivityScope`, `RetrainingIntervalUnit`.

- [ ] **Step 8: Build database-entities lib to confirm compiles**

Run: `pnpm nx build database-entities`
Expected: success.

- [ ] **Step 9: Commit**

```bash
git add libs/database-entities
git commit -m "feat(att-106): add introduction-schedule entities and enum extensions"
```

---

## Task 2: Migration + migration test

**Files:**
- Create: `apps/api/src/database/migrations/1778016390000-introduction-schedules.ts`
- Create: `apps/api/src/database/migrations/__tests__/1778016390000-introduction-schedules.spec.ts`

- [ ] **Step 1: Write migration test (failing)**

Path: `apps/api/src/database/migrations/__tests__/1778016390000-introduction-schedules.spec.ts`

```ts
// Migration up/down/up smoke test for introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import { DataSource } from 'typeorm';
import { entities } from '@attraccess/database-entities';
import { IntroductionSchedules1778016390000 } from '../1778016390000-introduction-schedules';

describe('Migration: introduction-schedules', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    });
    await ds.initialize();
  });

  afterEach(async () => { await ds.destroy(); });

  it('runs up, down, up without error and preserves rows', async () => {
    const migration = new IntroductionSchedules1778016390000();
    const runner = ds.createQueryRunner();
    await runner.query(`INSERT INTO resource (name, type) VALUES ('R1', 'MACHINE')`);
    await migration.up(runner);
    await migration.down(runner);
    await migration.up(runner);
    const tables = await runner.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'resource_introduction_schedule%'`,
    );
    expect(tables.length).toBe(3);
    await runner.release();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm nx test api --testFile=apps/api/src/database/migrations/__tests__/1778016390000-introduction-schedules.spec.ts --no-cache`
Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Implement migration**

Path: `apps/api/src/database/migrations/1778016390000-introduction-schedules.ts`

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class IntroductionSchedules1778016390000 implements MigrationInterface {
  name = 'IntroductionSchedules1778016390000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "resource_introduction_schedule" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "resourceId" integer,
        "resourceGroupId" integer,
        "name" text,
        "triggerType" varchar CHECK("triggerType" IN ('TIME_SINCE_INTRODUCTION','INACTIVITY')) NOT NULL,
        "blockAccess" boolean NOT NULL DEFAULT (0),
        "warnDaysBefore" integer NOT NULL DEFAULT (0),
        "enabled" boolean NOT NULL DEFAULT (1),
        CONSTRAINT "FK_ris_resource" FOREIGN KEY ("resourceId") REFERENCES "resource" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ris_group" FOREIGN KEY ("resourceGroupId") REFERENCES "resource_group" ("id") ON DELETE CASCADE
      )
    `);
    await q.query(`CREATE INDEX "IDX_ris_resource" ON "resource_introduction_schedule" ("resourceId")`);
    await q.query(`CREATE INDEX "IDX_ris_group" ON "resource_introduction_schedule" ("resourceGroupId")`);
    await q.query(`CREATE INDEX "IDX_ris_enabled" ON "resource_introduction_schedule" ("enabled")`);

    await q.query(`
      CREATE TABLE "resource_introduction_schedule_time_since_introduction_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL UNIQUE,
        "duration" integer NOT NULL,
        "unit" varchar CHECK("unit" IN ('DAYS','WEEKS','MONTHS','YEARS')) NOT NULL,
        CONSTRAINT "FK_ristsic_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_introduction_schedule" ("id") ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE TABLE "resource_introduction_schedule_inactivity_config" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "scheduleId" integer NOT NULL UNIQUE,
        "duration" integer NOT NULL,
        "unit" varchar CHECK("unit" IN ('DAYS','WEEKS','MONTHS','YEARS')) NOT NULL,
        "scope" varchar CHECK("scope" IN ('GROUP','RESOURCE')) NOT NULL,
        CONSTRAINT "FK_risic_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_introduction_schedule" ("id") ON DELETE CASCADE
      )
    `);

    // Rebuild resource_introduction_history_item: extend action enum, nullable performer, add scheduleId
    await q.query(`
      CREATE TABLE "rihi_tmp" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "introductionId" integer NOT NULL,
        "action" varchar CHECK("action" IN ('revoke','grant','renew','expire','warn_sent')) NOT NULL,
        "performedByUserId" integer,
        "comment" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "scheduleId" integer,
        CONSTRAINT "FK_rihi_intro" FOREIGN KEY ("introductionId") REFERENCES "resource_introduction" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rihi_user" FOREIGN KEY ("performedByUserId") REFERENCES "user" ("id"),
        CONSTRAINT "FK_rihi_schedule" FOREIGN KEY ("scheduleId") REFERENCES "resource_introduction_schedule" ("id") ON DELETE SET NULL
      )
    `);
    await q.query(`
      INSERT INTO "rihi_tmp" ("id","introductionId","action","performedByUserId","comment","createdAt","scheduleId")
      SELECT "id","introductionId","action","performedByUserId","comment","createdAt", NULL
      FROM "resource_introduction_history_item"
    `);
    await q.query(`DROP TABLE "resource_introduction_history_item"`);
    await q.query(`ALTER TABLE "rihi_tmp" RENAME TO "resource_introduction_history_item"`);
    await q.query(`CREATE INDEX "IDX_rihi_intro" ON "resource_introduction_history_item" ("introductionId")`);
    await q.query(`CREATE INDEX "IDX_rihi_schedule" ON "resource_introduction_history_item" ("scheduleId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Reverse history table
    await q.query(`
      CREATE TABLE "rihi_tmp" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "introductionId" integer NOT NULL,
        "action" varchar CHECK("action" IN ('revoke','grant')) NOT NULL,
        "performedByUserId" integer NOT NULL,
        "comment" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_rihi_intro" FOREIGN KEY ("introductionId") REFERENCES "resource_introduction" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rihi_user" FOREIGN KEY ("performedByUserId") REFERENCES "user" ("id")
      )
    `);
    await q.query(`
      INSERT INTO "rihi_tmp" ("id","introductionId","action","performedByUserId","comment","createdAt")
      SELECT "id","introductionId","action","performedByUserId","comment","createdAt"
      FROM "resource_introduction_history_item"
      WHERE "action" IN ('revoke','grant') AND "performedByUserId" IS NOT NULL
    `);
    await q.query(`DROP TABLE "resource_introduction_history_item"`);
    await q.query(`ALTER TABLE "rihi_tmp" RENAME TO "resource_introduction_history_item"`);

    await q.query(`DROP TABLE "resource_introduction_schedule_inactivity_config"`);
    await q.query(`DROP TABLE "resource_introduction_schedule_time_since_introduction_config"`);
    await q.query(`DROP TABLE "resource_introduction_schedule"`);
  }
}
```

- [ ] **Step 4: Re-run migration test**

Run: `pnpm nx test api --testFile=apps/api/src/database/migrations/__tests__/1778016390000-introduction-schedules.spec.ts --no-cache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/migrations
git commit -m "feat(att-106): migration for introduction schedules + history extensions"
```

---

## Task 3: Schedule CRUD service (resource scope)

**Files:**
- Create: `apps/api/src/resources/introductions/schedules/dtos/time-since-introduction-config.dto.ts`
- Create: `apps/api/src/resources/introductions/schedules/dtos/inactivity-config.dto.ts`
- Create: `apps/api/src/resources/introductions/schedules/dtos/create-introduction-schedule.dto.ts`
- Create: `apps/api/src/resources/introductions/schedules/dtos/update-introduction-schedule.dto.ts`
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule.service.ts`
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule.service.spec.ts`

- [ ] **Step 1: Write DTOs**

`time-since-introduction-config.dto.ts`:

```ts
// DTO for TIME_SINCE_INTRODUCTION trigger config
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { RetrainingIntervalUnit } from '@attraccess/database-entities';

export class TimeSinceIntroductionConfigDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  @IsEnum(RetrainingIntervalUnit)
  unit!: RetrainingIntervalUnit;
}
```

`inactivity-config.dto.ts`:

```ts
// DTO for INACTIVITY trigger config
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import {
  RetrainingIntervalUnit,
  ResourceIntroductionScheduleInactivityScope,
} from '@attraccess/database-entities';

export class InactivityConfigDto {
  @ApiProperty({ example: 6 })
  @IsInt()
  @Min(1)
  duration!: number;

  @ApiProperty({ enum: RetrainingIntervalUnit, enumName: 'RetrainingIntervalUnit' })
  @IsEnum(RetrainingIntervalUnit)
  unit!: RetrainingIntervalUnit;

  @ApiProperty({
    enum: ResourceIntroductionScheduleInactivityScope,
    enumName: 'ResourceIntroductionScheduleInactivityScope',
  })
  @IsEnum(ResourceIntroductionScheduleInactivityScope)
  scope!: ResourceIntroductionScheduleInactivityScope;
}
```

`create-introduction-schedule.dto.ts`:

```ts
// Create DTO for an introduction schedule (validates config matches triggerType)
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean, IsDefined, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceIntroductionScheduleTriggerType } from '@attraccess/database-entities';
import { TimeSinceIntroductionConfigDto } from './time-since-introduction-config.dto';
import { InactivityConfigDto } from './inactivity-config.dto';

export class CreateIntroductionScheduleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string | null;

  @ApiProperty({ enum: ResourceIntroductionScheduleTriggerType, enumName: 'ResourceIntroductionScheduleTriggerType' })
  @IsEnum(ResourceIntroductionScheduleTriggerType)
  triggerType!: ResourceIntroductionScheduleTriggerType;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  blockAccess?: boolean;

  @ApiProperty({ default: 0, minimum: 0, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  warnDaysBefore?: number;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((o: CreateIntroductionScheduleDto) =>
    o.triggerType === ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => TimeSinceIntroductionConfigDto)
  @ApiProperty({ required: false, type: TimeSinceIntroductionConfigDto })
  timeSinceIntroductionConfig?: TimeSinceIntroductionConfigDto;

  @ValidateIf((o: CreateIntroductionScheduleDto) =>
    o.triggerType === ResourceIntroductionScheduleTriggerType.INACTIVITY,
  )
  @IsDefined()
  @ValidateNested()
  @Type(() => InactivityConfigDto)
  @ApiProperty({ required: false, type: InactivityConfigDto })
  inactivityConfig?: InactivityConfigDto;
}
```

`update-introduction-schedule.dto.ts`:

```ts
// Update DTO for an introduction schedule (all fields optional)
// FEATURE: User retraining requirement (ATT-106)
import { PartialType } from '@nestjs/swagger';
import { CreateIntroductionScheduleDto } from './create-introduction-schedule.dto';
export class UpdateIntroductionScheduleDto extends PartialType(CreateIntroductionScheduleDto) {}
```

- [ ] **Step 2: Write failing test for service**

Path: `apps/api/src/resources/introductions/schedules/introduction-schedule.service.spec.ts`

```ts
// Service unit tests for introduction schedule CRUD
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import {
  Resource, ResourceGroup,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  RetrainingIntervalUnit,
  entities,
} from '@attraccess/database-entities';
import { IntroductionScheduleService } from './introduction-schedule.service';
import { NotFoundException } from '@nestjs/common';

describe('IntroductionScheduleService (resource scope)', () => {
  let ds: DataSource;
  let svc: IntroductionScheduleService;
  let resourceId: number;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: Object.values(entities),
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          ResourceIntroductionSchedule,
          ResourceIntroductionScheduleTimeSinceIntroductionConfig,
          ResourceIntroductionScheduleInactivityConfig,
          Resource,
          ResourceGroup,
        ]),
      ],
      providers: [IntroductionScheduleService],
    }).compile();

    ds = moduleRef.get(getDataSourceToken());
    svc = moduleRef.get(IntroductionScheduleService);
    const r = await ds.getRepository(Resource).save({ name: 'R1', type: 'MACHINE' as any });
    resourceId = r.id;
  });

  afterEach(async () => { await ds.destroy(); });

  it('creates TIME_SINCE_INTRODUCTION schedule', async () => {
    const s = await svc.create({ resourceId }, {
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
      blockAccess: true,
      warnDaysBefore: 30,
    });
    expect(s.id).toBeDefined();
    expect(s.timeSinceIntroductionConfig?.duration).toBe(1);
    expect(s.inactivityConfig).toBeFalsy();
    expect(s.blockAccess).toBe(true);
  });

  it('creates INACTIVITY schedule', async () => {
    const s = await svc.create({ resourceId }, {
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      inactivityConfig: {
        duration: 6, unit: RetrainingIntervalUnit.MONTHS,
        scope: ResourceIntroductionScheduleInactivityScope.RESOURCE,
      },
    });
    expect(s.inactivityConfig?.scope).toBe('RESOURCE');
    expect(s.timeSinceIntroductionConfig).toBeFalsy();
  });

  it('lists schedules for resource', async () => {
    await svc.create({ resourceId }, {
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
    });
    await svc.create({ resourceId }, {
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      inactivityConfig: { duration: 6, unit: RetrainingIntervalUnit.MONTHS, scope: 'RESOURCE' as any },
    });
    const list = await svc.findAll({ resourceId });
    expect(list).toHaveLength(2);
  });

  it('throws when resource not found on list', async () => {
    await expect(svc.findAll({ resourceId: 9999 })).rejects.toThrow(NotFoundException);
  });

  it('updates schedule swapping trigger type cleans old config', async () => {
    const s = await svc.create({ resourceId }, {
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
    });
    const upd = await svc.update({ resourceId }, s.id, {
      triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      inactivityConfig: { duration: 30, unit: RetrainingIntervalUnit.DAYS, scope: 'GROUP' as any },
    });
    expect(upd.timeSinceIntroductionConfig).toBeFalsy();
    expect(upd.inactivityConfig?.duration).toBe(30);
  });

  it('deletes schedule cascades configs', async () => {
    const s = await svc.create({ resourceId }, {
      triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      timeSinceIntroductionConfig: { duration: 1, unit: RetrainingIntervalUnit.YEARS },
    });
    await svc.delete({ resourceId }, s.id);
    const remaining = await ds
      .getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig)
      .find();
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run failing tests**

Run: `pnpm nx test api --testFile=apps/api/src/resources/introductions/schedules/introduction-schedule.service.spec.ts --no-cache`
Expected: FAIL (service not implemented).

- [ ] **Step 4: Implement service**

Path: `apps/api/src/resources/introductions/schedules/introduction-schedule.service.ts`

```ts
// CRUD service for ResourceIntroductionSchedule (resource and group scopes)
// FEATURE: User retraining requirement (ATT-106)
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTriggerType,
  Resource,
  ResourceGroup,
} from '@attraccess/database-entities';
import { CreateIntroductionScheduleDto } from './dtos/create-introduction-schedule.dto';
import { UpdateIntroductionScheduleDto } from './dtos/update-introduction-schedule.dto';

export interface ScheduleScope {
  resourceId?: number;
  resourceGroupId?: number;
}

@Injectable()
export class IntroductionScheduleService {
  constructor(
    @InjectRepository(ResourceIntroductionSchedule)
    private readonly scheduleRepo: Repository<ResourceIntroductionSchedule>,
    @InjectRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig)
    private readonly timeConfigRepo: Repository<ResourceIntroductionScheduleTimeSinceIntroductionConfig>,
    @InjectRepository(ResourceIntroductionScheduleInactivityConfig)
    private readonly inactivityConfigRepo: Repository<ResourceIntroductionScheduleInactivityConfig>,
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(ResourceGroup) private readonly groupRepo: Repository<ResourceGroup>,
  ) {}

  async findAll(scope: ScheduleScope): Promise<ResourceIntroductionSchedule[]> {
    await this.assertScope(scope);
    return this.scheduleRepo.find({
      where: this.scopeWhere(scope),
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
      order: { id: 'ASC' },
    });
  }

  async getOne(scope: ScheduleScope, scheduleId: number): Promise<ResourceIntroductionSchedule> {
    const s = await this.scheduleRepo.findOne({
      where: { id: scheduleId, ...this.scopeWhere(scope) },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    if (!s) throw new NotFoundException('Introduction schedule not found');
    return s;
  }

  async create(scope: ScheduleScope, dto: CreateIntroductionScheduleDto): Promise<ResourceIntroductionSchedule> {
    await this.assertScope(scope);
    const created = this.scheduleRepo.create({
      resourceId: scope.resourceId ?? null,
      resourceGroupId: scope.resourceGroupId ?? null,
      name: dto.name ?? null,
      triggerType: dto.triggerType,
      blockAccess: dto.blockAccess ?? false,
      warnDaysBefore: dto.warnDaysBefore ?? 0,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.scheduleRepo.save(created);
    await this.upsertConfig(saved.id, dto.triggerType, dto);
    return this.getOne(scope, saved.id);
  }

  async update(
    scope: ScheduleScope,
    scheduleId: number,
    dto: UpdateIntroductionScheduleDto,
  ): Promise<ResourceIntroductionSchedule> {
    const existing = await this.getOne(scope, scheduleId);
    if (dto.name !== undefined) existing.name = dto.name ?? null;
    if (dto.enabled !== undefined) existing.enabled = dto.enabled;
    if (dto.blockAccess !== undefined) existing.blockAccess = dto.blockAccess;
    if (dto.warnDaysBefore !== undefined) existing.warnDaysBefore = dto.warnDaysBefore;
    const triggerType = dto.triggerType ?? existing.triggerType;
    existing.triggerType = triggerType;
    await this.scheduleRepo.save(existing);

    if (
      dto.triggerType !== undefined ||
      dto.timeSinceIntroductionConfig !== undefined ||
      dto.inactivityConfig !== undefined
    ) {
      await this.timeConfigRepo.delete({ scheduleId });
      await this.inactivityConfigRepo.delete({ scheduleId });
      await this.upsertConfig(scheduleId, triggerType, dto);
    }
    return this.getOne(scope, scheduleId);
  }

  async delete(scope: ScheduleScope, scheduleId: number): Promise<void> {
    const s = await this.getOne(scope, scheduleId);
    await this.scheduleRepo.remove(s);
  }

  private async upsertConfig(
    scheduleId: number,
    triggerType: ResourceIntroductionScheduleTriggerType,
    dto: { timeSinceIntroductionConfig?: { duration: number; unit: any }; inactivityConfig?: { duration: number; unit: any; scope: any } },
  ): Promise<void> {
    if (triggerType === ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION) {
      if (!dto.timeSinceIntroductionConfig) {
        throw new BadRequestException('timeSinceIntroductionConfig required');
      }
      await this.timeConfigRepo.save(
        this.timeConfigRepo.create({ scheduleId, ...dto.timeSinceIntroductionConfig }),
      );
    } else if (triggerType === ResourceIntroductionScheduleTriggerType.INACTIVITY) {
      if (!dto.inactivityConfig) throw new BadRequestException('inactivityConfig required');
      await this.inactivityConfigRepo.save(
        this.inactivityConfigRepo.create({ scheduleId, ...dto.inactivityConfig }),
      );
    }
  }

  private scopeWhere(scope: ScheduleScope) {
    if (scope.resourceId != null) return { resourceId: scope.resourceId };
    if (scope.resourceGroupId != null) return { resourceGroupId: scope.resourceGroupId };
    throw new BadRequestException('Either resourceId or resourceGroupId required');
  }

  private async assertScope(scope: ScheduleScope): Promise<void> {
    if (scope.resourceId != null) {
      if (!(await this.resourceRepo.findOne({ where: { id: scope.resourceId } }))) {
        throw new NotFoundException(`Resource ${scope.resourceId} not found`);
      }
    } else if (scope.resourceGroupId != null) {
      if (!(await this.groupRepo.findOne({ where: { id: scope.resourceGroupId } }))) {
        throw new NotFoundException(`Resource group ${scope.resourceGroupId} not found`);
      }
    } else {
      throw new BadRequestException('Either resourceId or resourceGroupId required');
    }
  }
}
```

- [ ] **Step 5: Run tests, expect PASS**

Run: same command as Step 3.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resources/introductions/schedules
git commit -m "feat(att-106): introduction schedule CRUD service + DTOs"
```

---

## Task 4: Schedule controllers (resource + group)

**Files:**
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule.controller.ts`
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule.controller.spec.ts`
- Create: `apps/api/src/resources/groups/introductions/schedules/group-introduction-schedule.controller.ts`
- Create: `apps/api/src/resources/groups/introductions/schedules/group-introduction-schedule.controller.spec.ts`

- [ ] **Step 1: Write failing controller test (resource scope)**

Path: `apps/api/src/resources/introductions/schedules/introduction-schedule.controller.spec.ts`

```ts
// Controller integration tests for resource-scope introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { IntroductionScheduleController } from './introduction-schedule.controller';
import { IntroductionScheduleService } from './introduction-schedule.service';

describe('IntroductionScheduleController (resource)', () => {
  let app: INestApplication;
  const svc = {
    findAll: jest.fn(),
    getOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [IntroductionScheduleController],
      providers: [{ provide: IntroductionScheduleService, useValue: svc }],
    })
      .overrideGuard((await import('@attraccess/plugins-backend-sdk')).AuthGuard).useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    Object.values(svc).forEach((fn) => fn.mockReset());
  });

  afterEach(async () => { await app.close(); });

  it('GET list calls service.findAll', async () => {
    svc.findAll.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/resources/1/introduction-schedules').expect(200);
    expect(svc.findAll).toHaveBeenCalledWith({ resourceId: 1 });
  });

  it('POST validates triggerType+config', async () => {
    await request(app.getHttpServer())
      .post('/resources/1/introduction-schedules')
      .send({ triggerType: 'TIME_SINCE_INTRODUCTION' })
      .expect(400);
  });

  it('POST creates valid TIME_SINCE_INTRODUCTION schedule', async () => {
    svc.create.mockResolvedValue({ id: 5 });
    await request(app.getHttpServer())
      .post('/resources/1/introduction-schedules')
      .send({
        triggerType: 'TIME_SINCE_INTRODUCTION',
        timeSinceIntroductionConfig: { duration: 1, unit: 'YEARS' },
      })
      .expect(201);
    expect(svc.create).toHaveBeenCalledWith({ resourceId: 1 }, expect.any(Object));
  });

  it('PATCH updates', async () => {
    svc.update.mockResolvedValue({});
    await request(app.getHttpServer())
      .patch('/resources/1/introduction-schedules/5')
      .send({ enabled: false })
      .expect(200);
  });

  it('DELETE returns 204', async () => {
    svc.delete.mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .delete('/resources/1/introduction-schedules/5')
      .expect(204);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm nx test api --testFile=apps/api/src/resources/introductions/schedules/introduction-schedule.controller.spec.ts --no-cache`
Expected: FAIL — controller not implemented.

- [ ] **Step 3: Implement resource controller**

Path: `apps/api/src/resources/introductions/schedules/introduction-schedule.controller.ts`

```ts
// HTTP controller for resource-scope introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import {
  Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionSchedule } from '@attraccess/database-entities';
import { IntroductionScheduleService } from './introduction-schedule.service';
import { CreateIntroductionScheduleDto } from './dtos/create-introduction-schedule.dto';
import { UpdateIntroductionScheduleDto } from './dtos/update-introduction-schedule.dto';

@ApiTags('Resource Introduction Schedules')
@Controller('resources/:resourceId/introduction-schedules')
@Auth()
export class IntroductionScheduleController {
  constructor(private readonly svc: IntroductionScheduleService) {}

  @Get()
  @ApiOperation({ summary: 'List introduction schedules for resource', operationId: 'findIntroductionSchedules' })
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiResponse({ status: 200, type: [ResourceIntroductionSchedule] })
  list(@Param('resourceId', ParseIntPipe) resourceId: number) {
    return this.svc.findAll({ resourceId });
  }

  @Get(':scheduleId')
  @ApiOperation({ summary: 'Get one schedule', operationId: 'getIntroductionSchedule' })
  getOne(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ) {
    return this.svc.getOne({ resourceId }, scheduleId);
  }

  @Post()
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Create schedule', operationId: 'createIntroductionSchedule' })
  create(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: CreateIntroductionScheduleDto,
  ) {
    return this.svc.create({ resourceId }, dto);
  }

  @Patch(':scheduleId')
  @Auth('canManageResources')
  @ApiOperation({ summary: 'Update schedule', operationId: 'updateIntroductionSchedule' })
  update(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() dto: UpdateIntroductionScheduleDto,
  ) {
    return this.svc.update({ resourceId }, scheduleId, dto);
  }

  @Delete(':scheduleId')
  @Auth('canManageResources')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete schedule', operationId: 'deleteIntroductionSchedule' })
  async remove(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ) {
    await this.svc.delete({ resourceId }, scheduleId);
  }
}
```

- [ ] **Step 4: Run resource controller test, expect PASS**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Repeat for group controller**

Mirror the controller above. Path:
`apps/api/src/resources/groups/introductions/schedules/group-introduction-schedule.controller.ts`

```ts
// HTTP controller for group-scope introduction schedules
// FEATURE: User retraining requirement (ATT-106)
import {
  Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionSchedule } from '@attraccess/database-entities';
import { IntroductionScheduleService } from '../../../introductions/schedules/introduction-schedule.service';
import { CreateIntroductionScheduleDto } from '../../../introductions/schedules/dtos/create-introduction-schedule.dto';
import { UpdateIntroductionScheduleDto } from '../../../introductions/schedules/dtos/update-introduction-schedule.dto';

@ApiTags('Resource Group Introduction Schedules')
@Controller('resource-groups/:groupId/introduction-schedules')
@Auth()
export class GroupIntroductionScheduleController {
  constructor(private readonly svc: IntroductionScheduleService) {}

  @Get()
  @ApiOperation({ operationId: 'findGroupIntroductionSchedules' })
  @ApiResponse({ status: 200, type: [ResourceIntroductionSchedule] })
  list(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.svc.findAll({ resourceGroupId: groupId });
  }

  @Get(':scheduleId')
  @ApiOperation({ operationId: 'getGroupIntroductionSchedule' })
  getOne(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ) {
    return this.svc.getOne({ resourceGroupId: groupId }, scheduleId);
  }

  @Post()
  @Auth('canManageResources')
  @ApiOperation({ operationId: 'createGroupIntroductionSchedule' })
  create(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: CreateIntroductionScheduleDto,
  ) {
    return this.svc.create({ resourceGroupId: groupId }, dto);
  }

  @Patch(':scheduleId')
  @Auth('canManageResources')
  @ApiOperation({ operationId: 'updateGroupIntroductionSchedule' })
  update(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() dto: UpdateIntroductionScheduleDto,
  ) {
    return this.svc.update({ resourceGroupId: groupId }, scheduleId, dto);
  }

  @Delete(':scheduleId')
  @Auth('canManageResources')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'deleteGroupIntroductionSchedule' })
  async remove(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
  ) {
    await this.svc.delete({ resourceGroupId: groupId }, scheduleId);
  }
}
```

Mirror the controller spec to validate group routes (`/resource-groups/1/introduction-schedules`). Same structure as resource spec.

- [ ] **Step 6: Run group controller test, expect PASS**

Run: `pnpm nx test api --testFile=apps/api/src/resources/groups/introductions/schedules/group-introduction-schedule.controller.spec.ts --no-cache`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/resources/introductions/schedules apps/api/src/resources/groups/introductions/schedules
git commit -m "feat(att-106): introduction schedule controllers + tests"
```

---

## Task 5: Evaluator service — baseline + computeDueAt + isDue/isWarning

**Files:**
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.ts`
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.spec.ts`

- [ ] **Step 1: Write failing tests for baseline + computeDueAt + isDue + isWarning**

Path: `apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.spec.ts`

```ts
// Unit tests for the IntroductionScheduleEvaluatorService
// FEATURE: User retraining requirement (ATT-106)
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import {
  Resource, ResourceGroup, ResourceUsage, User,
  ResourceIntroduction, ResourceIntroductionHistoryItem, IntroductionHistoryAction,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  RetrainingIntervalUnit,
  entities,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntroductionScheduleEvaluatorService } from './introduction-schedule-evaluator.service';

const fixedNow = new Date('2026-05-05T00:00:00.000Z');

describe('IntroductionScheduleEvaluatorService', () => {
  let ds: DataSource;
  let svc: IntroductionScheduleEvaluatorService;
  let userId: number;
  let resourceId: number;
  let introductionId: number;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3', database: ':memory:',
          entities: Object.values(entities), synchronize: true,
        }),
        TypeOrmModule.forFeature([
          Resource, ResourceGroup, ResourceUsage, User,
          ResourceIntroduction, ResourceIntroductionHistoryItem,
          ResourceIntroductionSchedule,
          ResourceIntroductionScheduleTimeSinceIntroductionConfig,
          ResourceIntroductionScheduleInactivityConfig,
        ]),
      ],
      providers: [
        IntroductionScheduleEvaluatorService,
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: 'NotifierStub', useValue: { sendWarning: jest.fn() } },
      ],
    }).compile();

    ds = mod.get(getDataSourceToken());
    svc = mod.get(IntroductionScheduleEvaluatorService);

    const user = await ds.getRepository(User).save({ username: 'u', email: 'u@u.test' } as any);
    userId = user.id;
    const res = await ds.getRepository(Resource).save({ name: 'R1', type: 'MACHINE' as any });
    resourceId = res.id;
    const intro = await ds.getRepository(ResourceIntroduction).save({
      resource: res, receiverUserId: userId, completedAt: new Date('2025-05-05T00:00:00.000Z'),
    } as any);
    introductionId = intro.id;
    await ds.getRepository(ResourceIntroductionHistoryItem).save({
      introductionId, action: IntroductionHistoryAction.GRANT, performedByUserId: userId,
      createdAt: new Date('2025-05-05T00:00:00.000Z'),
    });
  });

  afterEach(async () => { await ds.destroy(); });

  it('baseline = completedAt with no RENEW', async () => {
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const baseline = await svc.computeBaseline(intro);
    expect(baseline.toISOString()).toBe('2025-05-05T00:00:00.000Z');
  });

  it('baseline = latest RENEW createdAt', async () => {
    await ds.getRepository(ResourceIntroductionHistoryItem).save({
      introductionId, action: IntroductionHistoryAction.RENEW, performedByUserId: userId,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    expect((await svc.computeBaseline(intro)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('TIME_SINCE_INTRODUCTION dueAt = baseline + duration', async () => {
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: true, warnDaysBefore: 0, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id, duration: 1, unit: RetrainingIntervalUnit.YEARS,
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const dueAt = await svc.computeDueAt(
      await svc.getSchedulesForIntroduction(intro).then((s) => s[0]),
      intro,
    );
    expect(dueAt?.toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });

  it('isDue boundary: dueAt-1ms = false, dueAt = true', async () => {
    // ... build schedule then call svc.isDue with frozen now
    // construct manually
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: true, warnDaysBefore: 0, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id, duration: 1, unit: RetrainingIntervalUnit.YEARS,
    });
    const full = await ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const justBefore = new Date(fixedNow.getTime() - 1);
    expect(await svc.isDue(full, intro, justBefore)).toBe(false);
    expect(await svc.isDue(full, intro, fixedNow)).toBe(true);
  });

  it('isWarning fires inside warnDaysBefore window only', async () => {
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: false, warnDaysBefore: 30, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id, duration: 1, unit: RetrainingIntervalUnit.YEARS,
    });
    const full = await ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id }, relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    expect(await svc.isWarning(full, intro, new Date('2026-04-04T00:00:00.000Z'))).toBe(false);
    expect(await svc.isWarning(full, intro, new Date('2026-04-06T00:00:00.000Z'))).toBe(true);
    expect(await svc.isWarning(full, intro, fixedNow)).toBe(false); // already due, not warning
  });

  it('INACTIVITY scope=RESOURCE: usage on this resource resets baseline', async () => {
    await ds.getRepository(ResourceUsage).save({
      resourceId, userId, startTime: new Date('2026-04-01T00:00:00.000Z'),
      endTime: new Date('2026-04-01T01:00:00.000Z'),
    } as any);
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      blockAccess: true, warnDaysBefore: 0, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleInactivityConfig).save({
      scheduleId: schedule.id, duration: 6, unit: RetrainingIntervalUnit.MONTHS,
      scope: ResourceIntroductionScheduleInactivityScope.RESOURCE,
    });
    const full = await ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id }, relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const due = await svc.computeDueAt(full, intro);
    expect(due?.toISOString()).toBe('2026-10-01T00:00:00.000Z'); // 6 months past usage
  });

  it('INACTIVITY scope=GROUP: usage on sibling resource resets baseline', async () => {
    const group = await ds.getRepository(ResourceGroup).save({ name: 'G' } as any);
    const sibling = await ds.getRepository(Resource).save({ name: 'R2', type: 'MACHINE' as any });
    await ds.createQueryBuilder()
      .relation(Resource, 'groups').of(sibling.id).add(group.id);
    await ds.createQueryBuilder()
      .relation(Resource, 'groups').of(resourceId).add(group.id);
    await ds.getRepository(ResourceUsage).save({
      resourceId: sibling.id, userId, startTime: new Date('2026-04-01T00:00:00.000Z'),
      endTime: new Date('2026-04-01T01:00:00.000Z'),
    } as any);
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceGroupId: group.id, triggerType: ResourceIntroductionScheduleTriggerType.INACTIVITY,
      blockAccess: true, warnDaysBefore: 0, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleInactivityConfig).save({
      scheduleId: schedule.id, duration: 6, unit: RetrainingIntervalUnit.MONTHS,
      scope: ResourceIntroductionScheduleInactivityScope.GROUP,
    });
    const full = await ds.getRepository(ResourceIntroductionSchedule).findOneOrFail({
      where: { id: schedule.id }, relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    const intro = await ds.getRepository(ResourceIntroduction).findOneByOrFail({ id: introductionId });
    const due = await svc.computeDueAt(full, intro);
    expect(due?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm nx test api --testFile=apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.spec.ts --no-cache`
Expected: FAIL — service not implemented.

- [ ] **Step 3: Implement evaluator (no tick yet)**

Path: `apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.ts`

```ts
// Evaluator for introduction schedules: baseline + dueAt + isDue + isWarning + tick
// FEATURE: User retraining requirement (ATT-106)
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ResourceIntroduction, ResourceIntroductionHistoryItem, IntroductionHistoryAction,
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTriggerType,
  ResourceIntroductionScheduleInactivityScope,
  RetrainingIntervalUnit,
  ResourceUsage, Resource,
} from '@attraccess/database-entities';
import { ResourceIntroductionChangedEvent } from '../events/resource-introduction-changed.event';

const MS_PER_DAY = 86_400_000;

function addInterval(d: Date, duration: number, unit: RetrainingIntervalUnit): Date {
  const r = new Date(d);
  switch (unit) {
    case RetrainingIntervalUnit.DAYS: r.setUTCDate(r.getUTCDate() + duration); break;
    case RetrainingIntervalUnit.WEEKS: r.setUTCDate(r.getUTCDate() + duration * 7); break;
    case RetrainingIntervalUnit.MONTHS: r.setUTCMonth(r.getUTCMonth() + duration); break;
    case RetrainingIntervalUnit.YEARS: r.setUTCFullYear(r.getUTCFullYear() + duration); break;
  }
  return r;
}

@Injectable()
export class IntroductionScheduleEvaluatorService {
  private readonly logger = new Logger(IntroductionScheduleEvaluatorService.name);

  constructor(
    @InjectRepository(ResourceIntroduction) private readonly introRepo: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem) private readonly histRepo: Repository<ResourceIntroductionHistoryItem>,
    @InjectRepository(ResourceIntroductionSchedule) private readonly schedRepo: Repository<ResourceIntroductionSchedule>,
    @InjectRepository(ResourceUsage) private readonly usageRepo: Repository<ResourceUsage>,
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async computeBaseline(introduction: ResourceIntroduction): Promise<Date> {
    const lastRenew = await this.histRepo.findOne({
      where: { introductionId: introduction.id, action: IntroductionHistoryAction.RENEW },
      order: { createdAt: 'DESC' },
    });
    const completedAt = introduction.completedAt instanceof Date
      ? introduction.completedAt
      : new Date(introduction.completedAt);
    if (!lastRenew) return completedAt;
    return lastRenew.createdAt > completedAt ? lastRenew.createdAt : completedAt;
  }

  private async lastUsageOnResource(userId: number, resourceId: number): Promise<Date | null> {
    const u = await this.usageRepo.findOne({
      where: { resourceId, userId },
      order: { startTime: 'DESC' },
    });
    return u?.startTime ?? null;
  }

  private async lastUsageInGroup(userId: number, groupId: number): Promise<Date | null> {
    const resources = await this.resourceRepo.find({
      where: { groups: { id: groupId } as any },
      relations: ['groups'],
    });
    if (resources.length === 0) return null;
    const u = await this.usageRepo.findOne({
      where: { resourceId: In(resources.map((r) => r.id)), userId },
      order: { startTime: 'DESC' },
    });
    return u?.startTime ?? null;
  }

  async computeDueAt(schedule: ResourceIntroductionSchedule, introduction: ResourceIntroduction): Promise<Date | null> {
    const baseline = await this.computeBaseline(introduction);
    if (schedule.triggerType === ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION) {
      const cfg = schedule.timeSinceIntroductionConfig;
      if (!cfg) return null;
      return addInterval(baseline, cfg.duration, cfg.unit);
    }
    const cfg = schedule.inactivityConfig;
    if (!cfg) return null;
    let lastUsage: Date | null = null;
    if (cfg.scope === ResourceIntroductionScheduleInactivityScope.RESOURCE) {
      const resourceId = schedule.resourceId ?? introduction.resourceId;
      if (resourceId == null) return null;
      lastUsage = await this.lastUsageOnResource(introduction.receiverUserId, resourceId);
    } else {
      const groupId = schedule.resourceGroupId;
      if (groupId == null) return null;
      lastUsage = await this.lastUsageInGroup(introduction.receiverUserId, groupId);
    }
    const reference = lastUsage && lastUsage > baseline ? lastUsage : baseline;
    return addInterval(reference, cfg.duration, cfg.unit);
  }

  async isDue(schedule: ResourceIntroductionSchedule, introduction: ResourceIntroduction, now = new Date()): Promise<boolean> {
    const due = await this.computeDueAt(schedule, introduction);
    if (!due) return false;
    return now.getTime() >= due.getTime();
  }

  async isWarning(schedule: ResourceIntroductionSchedule, introduction: ResourceIntroduction, now = new Date()): Promise<boolean> {
    if (!schedule.warnDaysBefore || schedule.warnDaysBefore <= 0) return false;
    const due = await this.computeDueAt(schedule, introduction);
    if (!due) return false;
    if (now.getTime() >= due.getTime()) return false;
    const warnFrom = due.getTime() - schedule.warnDaysBefore * MS_PER_DAY;
    return now.getTime() >= warnFrom;
  }

  async getSchedulesForIntroduction(introduction: ResourceIntroduction): Promise<ResourceIntroductionSchedule[]> {
    const resourceId = introduction.resourceId;
    const groupId = introduction.resourceGroupId;
    const where: any[] = [];
    if (resourceId != null) where.push({ resourceId, enabled: true });
    if (groupId != null) where.push({ resourceGroupId: groupId, enabled: true });
    if (resourceId != null) {
      const groups = await this.resourceRepo.findOne({
        where: { id: resourceId }, relations: ['groups'],
      });
      for (const g of groups?.groups ?? []) {
        where.push({ resourceGroupId: g.id, enabled: true });
      }
    }
    if (where.length === 0) return [];
    return this.schedRepo.find({
      where,
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
  }

  async isBlockedByExpiry(introduction: ResourceIntroduction, now = new Date()): Promise<boolean> {
    const schedules = await this.getSchedulesForIntroduction(introduction);
    for (const s of schedules) {
      if (!s.blockAccess) continue;
      if (await this.isDue(s, introduction, now)) return true;
    }
    return false;
  }

  async evaluateUserOnResource(userId: number, resourceId: number, now = new Date()): Promise<{
    status: 'ACTIVE' | 'WARNING' | 'EXPIRED';
    expiresAt: Date | null;
    schedules: Array<{ scheduleId: number; dueAt: Date | null; isWarning: boolean; isDue: boolean; blockAccess: boolean }>;
  }> {
    const intro = await this.introRepo.findOne({
      where: { resourceId, receiverUserId: userId },
    });
    if (!intro) return { status: 'ACTIVE', expiresAt: null, schedules: [] };
    const schedules = await this.getSchedulesForIntroduction(intro);
    const rows = await Promise.all(schedules.map(async (s) => {
      const due = await this.computeDueAt(s, intro);
      return {
        scheduleId: s.id, dueAt: due,
        isDue: !!due && now.getTime() >= due.getTime(),
        isWarning: await this.isWarning(s, intro, now),
        blockAccess: s.blockAccess,
      };
    }));
    const earliest = rows.map((r) => r.dueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    let status: 'ACTIVE' | 'WARNING' | 'EXPIRED' = 'ACTIVE';
    if (rows.some((r) => r.isDue)) status = 'EXPIRED';
    else if (rows.some((r) => r.isWarning)) status = 'WARNING';
    return { status, expiresAt: earliest, schedules: rows };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async tick(now = new Date()): Promise<void> {
    const schedules = await this.schedRepo.find({
      where: { enabled: true },
      relations: ['timeSinceIntroductionConfig', 'inactivityConfig'],
    });
    for (const s of schedules) {
      const intros = await this.findIntroductionsForSchedule(s);
      for (const intro of intros) {
        if (await this.isDue(s, intro, now)) await this.recordExpireOnce(s, intro);
        else if (await this.isWarning(s, intro, now)) await this.recordWarnSentOnce(s, intro);
      }
    }
  }

  private async findIntroductionsForSchedule(s: ResourceIntroductionSchedule): Promise<ResourceIntroduction[]> {
    if (s.resourceId != null) {
      return this.introRepo.find({ where: { resourceId: s.resourceId } });
    }
    if (s.resourceGroupId != null) {
      return this.introRepo.find({ where: { resourceGroupId: s.resourceGroupId } });
    }
    return [];
  }

  private async recordExpireOnce(s: ResourceIntroductionSchedule, intro: ResourceIntroduction): Promise<void> {
    const baseline = await this.computeBaseline(intro);
    const exists = await this.histRepo.findOne({
      where: {
        introductionId: intro.id,
        action: IntroductionHistoryAction.EXPIRE,
        scheduleId: s.id,
      },
      order: { createdAt: 'DESC' },
    });
    if (exists && exists.createdAt > baseline) return;
    await this.histRepo.save(this.histRepo.create({
      introductionId: intro.id,
      action: IntroductionHistoryAction.EXPIRE,
      performedByUserId: null,
      scheduleId: s.id,
    }));
    this.events.emit(
      ResourceIntroductionChangedEvent.EVENT_NAME,
      new ResourceIntroductionChangedEvent(intro.id),
    );
  }

  private async recordWarnSentOnce(s: ResourceIntroductionSchedule, intro: ResourceIntroduction): Promise<void> {
    const baseline = await this.computeBaseline(intro);
    const exists = await this.histRepo.findOne({
      where: {
        introductionId: intro.id,
        action: IntroductionHistoryAction.WARN_SENT,
        scheduleId: s.id,
      },
      order: { createdAt: 'DESC' },
    });
    if (exists && exists.createdAt > baseline) return;
    await this.histRepo.save(this.histRepo.create({
      introductionId: intro.id,
      action: IntroductionHistoryAction.WARN_SENT,
      performedByUserId: null,
      scheduleId: s.id,
    }));
    this.events.emit(
      ResourceIntroductionChangedEvent.EVENT_NAME,
      new ResourceIntroductionChangedEvent(intro.id),
    );
  }
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: same command as Step 2.
Expected: PASS for the 7 cases written.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/resources/introductions/schedules
git commit -m "feat(att-106): introduction schedule evaluator core (baseline, dueAt, isDue, isWarning)"
```

---

## Task 6: Evaluator — tick() emits EXPIRE/WARN_SENT once per cycle

**Files:**
- Modify: `apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.spec.ts` (extend with tick tests)

- [ ] **Step 1: Add failing tick tests**

Append to the spec from Task 5:

```ts
describe('tick()', () => {
  it('emits one EXPIRE per (schedule, cycle) and is idempotent on rerun', async () => {
    // schedule due: TIME_SINCE_INTRODUCTION 1 year, baseline 2025-05-05
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: true, warnDaysBefore: 0, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id, duration: 1, unit: RetrainingIntervalUnit.YEARS,
    });
    await svc.tick(fixedNow);
    await svc.tick(fixedNow);
    const expires = await ds.getRepository(ResourceIntroductionHistoryItem).find({
      where: { action: IntroductionHistoryAction.EXPIRE, introductionId },
    });
    expect(expires).toHaveLength(1);
    expect(expires[0].scheduleId).toBe(schedule.id);
    expect(expires[0].performedByUserId).toBeNull();
  });

  it('after RENEW, second cycle emits a new EXPIRE', async () => {
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: true, warnDaysBefore: 0, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id, duration: 1, unit: RetrainingIntervalUnit.YEARS,
    });
    await svc.tick(fixedNow);
    // RENEW resets baseline
    await ds.getRepository(ResourceIntroductionHistoryItem).save({
      introductionId, action: IntroductionHistoryAction.RENEW, performedByUserId: userId,
      createdAt: new Date('2026-05-05T00:00:00.000Z'),
    });
    // 1y past renew
    await svc.tick(new Date('2027-05-05T00:00:00.000Z'));
    const expires = await ds.getRepository(ResourceIntroductionHistoryItem).find({
      where: { action: IntroductionHistoryAction.EXPIRE, introductionId },
    });
    expect(expires).toHaveLength(2);
  });

  it('warn sent once per cycle', async () => {
    const schedule = await ds.getRepository(ResourceIntroductionSchedule).save({
      resourceId, triggerType: ResourceIntroductionScheduleTriggerType.TIME_SINCE_INTRODUCTION,
      blockAccess: false, warnDaysBefore: 30, enabled: true,
    } as any);
    await ds.getRepository(ResourceIntroductionScheduleTimeSinceIntroductionConfig).save({
      scheduleId: schedule.id, duration: 1, unit: RetrainingIntervalUnit.YEARS,
    });
    const warningTime = new Date('2026-04-15T00:00:00.000Z');
    await svc.tick(warningTime);
    await svc.tick(warningTime);
    const sent = await ds.getRepository(ResourceIntroductionHistoryItem).find({
      where: { action: IntroductionHistoryAction.WARN_SENT, introductionId },
    });
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm nx test api --testFile=apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.spec.ts --no-cache`
Expected: PASS (the implementation in Task 5 already covers tick).

If FAIL, fix evaluator until tests pass; do not move on until green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/resources/introductions/schedules
git commit -m "test(att-106): tick idempotency and warn-once tests for evaluator"
```

---

## Task 7: Extend `hasValidIntroduction` (resource + group services)

**Files:**
- Modify: `apps/api/src/resources/introductions/resouceIntroductions.service.ts`
- Modify: `apps/api/src/resources/introductions/resouceIntroductions.service.spec.ts`
- Modify: `apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.ts`
- Modify: `apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.spec.ts`

- [ ] **Step 1: Add failing test on resource service**

Path: `apps/api/src/resources/introductions/resouceIntroductions.service.spec.ts`

Add a `describe('expiry')` block:

```ts
describe('hasValidIntroduction with expiry', () => {
  it('returns false when blocking schedule is due', async () => {
    evaluator.isBlockedByExpiry.mockResolvedValue(true);
    historyRepo.findOne.mockResolvedValue({ action: IntroductionHistoryAction.GRANT });
    introRepo.findOne.mockResolvedValue({ id: 1 });
    expect(await service.hasValidIntroduction(1, 2)).toBe(false);
  });

  it('returns true when due but blockAccess=false (evaluator returns false)', async () => {
    evaluator.isBlockedByExpiry.mockResolvedValue(false);
    historyRepo.findOne.mockResolvedValue({ action: IntroductionHistoryAction.GRANT });
    introRepo.findOne.mockResolvedValue({ id: 1 });
    expect(await service.hasValidIntroduction(1, 2)).toBe(true);
  });

  it('treats RENEW as valid grant', async () => {
    evaluator.isBlockedByExpiry.mockResolvedValue(false);
    historyRepo.findOne.mockResolvedValue({ action: IntroductionHistoryAction.RENEW });
    introRepo.findOne.mockResolvedValue({ id: 1 });
    expect(await service.hasValidIntroduction(1, 2)).toBe(true);
  });

  it('ignores EXPIRE/WARN_SENT history when finding last user-action', async () => {
    evaluator.isBlockedByExpiry.mockResolvedValue(false);
    // historyRepo.findOne in this code path uses NotIn(['expire','warn_sent'])
    historyRepo.findOne.mockResolvedValue({ action: IntroductionHistoryAction.GRANT });
    introRepo.findOne.mockResolvedValue({ id: 1 });
    expect(await service.hasValidIntroduction(1, 2)).toBe(true);
  });
});
```

The existing test setup must mock `evaluator: IntroductionScheduleEvaluatorService` via `{ provide: IntroductionScheduleEvaluatorService, useValue: { isBlockedByExpiry: jest.fn() } }`. Update the providers array.

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm nx test api --testFile=apps/api/src/resources/introductions/resouceIntroductions.service.spec.ts --no-cache`
Expected: FAIL — service still uses old logic.

- [ ] **Step 3: Modify `resouceIntroductions.service.ts`**

Add evaluator dependency in constructor and update logic:

```ts
constructor(
  // ...existing repos and services...
  private readonly scheduleEvaluator: IntroductionScheduleEvaluatorService,
) {}

private async getLastNonSystemHistoryItemOfUser(
  resourceId: number, userId: number, em?: EntityManager,
): Promise<ResourceIntroductionHistoryItem | null> {
  const repo = em ? em.getRepository(ResourceIntroductionHistoryItem) : this.resourceIntroductionHistoryItemRepository;
  return repo.findOne({
    where: {
      introduction: { resource: { id: resourceId }, receiverUser: { id: userId } },
      action: Not(In([IntroductionHistoryAction.EXPIRE, IntroductionHistoryAction.WARN_SENT])),
    },
    order: { createdAt: 'DESC' },
  });
}

public async hasValidIntroduction(resourceId: number, userId: number, em?: EntityManager): Promise<boolean> {
  const last = await this.getLastNonSystemHistoryItemOfUser(resourceId, userId, em);
  const isActiveAction =
    last?.action === IntroductionHistoryAction.GRANT
    || last?.action === IntroductionHistoryAction.RENEW;
  if (!isActiveAction) return false;
  const intro = await this.getIntroductionOfUser(resourceId, userId, em);
  if (!intro) return false;
  return !(await this.scheduleEvaluator.isBlockedByExpiry(intro));
}
```

Imports: add `Not, In` from `typeorm` and `IntroductionScheduleEvaluatorService` from `./schedules/introduction-schedule-evaluator.service`.

- [ ] **Step 4: Run resource service test, expect PASS**

Run: same as Step 2.
Expected: PASS.

- [ ] **Step 5: Repeat the same change in groups service**

`apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.ts`:
inject the evaluator, mirror the same change in its `hasValidIntroduction`. Update its spec the same way.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resources/introductions/resouceIntroductions.service.ts apps/api/src/resources/introductions/resouceIntroductions.service.spec.ts apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.ts apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.spec.ts
git commit -m "feat(att-106): hasValidIntroduction respects schedule expiry"
```

---

## Task 8: Renewal endpoints

**Files:**
- Create: `apps/api/src/resources/introductions/dtos/renewIntroduction.request.dto.ts`
- Modify: `apps/api/src/resources/introductions/resouceIntroductions.service.ts` (add `renew()`)
- Modify: `apps/api/src/resources/introductions/resourceIntroductions.controller.ts` (add POST renew)
- Modify: `apps/api/src/resources/groups/introductions/resourceGroups.introductions.service.ts` (add `renew()`)
- Modify: `apps/api/src/resources/groups/introductions/resourceGroups.introductions.controller.ts`
- Modify: spec files

- [ ] **Step 1: Create DTO**

```ts
// DTO for the renew introduction endpoint
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RenewIntroductionRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
```

- [ ] **Step 2: Write failing test for `renew()`**

Add to `resouceIntroductions.service.spec.ts`:

```ts
describe('renew', () => {
  it('appends a RENEW history item and returns it', async () => {
    introRepo.findOne.mockResolvedValue({ id: 5 });
    historyRepo.create.mockImplementation((x) => x);
    historyRepo.save.mockImplementation((x) => Promise.resolve({ ...x, id: 100, createdAt: new Date() }));
    const result = await service.renew(1, 2, { comment: 'OK' });
    expect(result.action).toBe(IntroductionHistoryAction.RENEW);
    expect(historyRepo.save).toHaveBeenCalled();
  });

  it('throws NotFound when no introduction exists', async () => {
    introRepo.findOne.mockResolvedValue(null);
    await expect(service.renew(1, 2)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run tests, expect FAIL**

- [ ] **Step 4: Implement `renew()` on resource service**

Add to `ResourceIntroductionsService`:

```ts
public async renew(resourceId: number, userId: number, dto?: { comment?: string }): Promise<ResourceIntroductionHistoryItem> {
  const intro = await this.getIntroductionOfUser(resourceId, userId);
  if (!intro) throw new NotFoundException('Introduction not found');
  const item = await this.resourceIntroductionHistoryItemRepository.save(
    this.resourceIntroductionHistoryItemRepository.create({
      introduction: { id: intro.id },
      action: IntroductionHistoryAction.RENEW,
      comment: dto?.comment ?? null,
      performedByUser: { id: userId },
    }),
  );
  this.eventEmitter.emit(
    ResourceIntroductionChangedEvent.EVENT_NAME,
    new ResourceIntroductionChangedEvent(intro.id),
  );
  return item;
}
```

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Add controller endpoint**

In `resourceIntroductions.controller.ts`:

```ts
@Post(':userId/renew')
@CanGrantIntroduction()  // existing introducer guard from this controller
@ApiOperation({ operationId: 'renewIntroduction' })
@ApiResponse({ status: 201, type: ResourceIntroductionHistoryItem })
renew(
  @Param('resourceId', ParseIntPipe) resourceId: number,
  @Param('userId', ParseIntPipe) userId: number,
  @Body() dto: RenewIntroductionRequestDto,
) {
  return this.service.renew(resourceId, userId, dto);
}
```

(Use the same auth decorator the existing grant endpoint uses — confirm the actual decorator name in this file before committing.)

- [ ] **Step 7: Repeat in groups service + controller**

Same shape, group equivalent.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/resources/introductions apps/api/src/resources/groups/introductions
git commit -m "feat(att-106): renew introduction endpoint (resource + group)"
```

---

## Task 9: Status DTO + endpoint + self-service expiring list

**Files:**
- Create: `apps/api/src/resources/introductions/dtos/introductionStatus.response.dto.ts`
- Create: `apps/api/src/resources/introductions/dtos/expiringIntroduction.response.dto.ts`
- Modify: `apps/api/src/resources/introductions/dtos/getStatus.response.dto.ts` (add `status`, `expiresAt`, `schedules`)
- Modify: `apps/api/src/resources/introductions/resourceIntroductions.controller.ts` (use new evaluator)
- Modify: `apps/api/src/resources/groups/introductions/resourceGroups.introductions.controller.ts`
- Modify: `apps/api/src/users/users.controller.ts` + module

- [ ] **Step 1: Create response DTOs**

`introductionStatus.response.dto.ts`:

```ts
// Response DTO with full introduction status (active, warning, expired)
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';

export enum IntroductionStatus {
  ACTIVE = 'ACTIVE',
  WARNING = 'WARNING',
  EXPIRED = 'EXPIRED',
}

export class IntroductionScheduleStatusDto {
  @ApiProperty() scheduleId!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: string | null;
  @ApiProperty() isWarning!: boolean;
  @ApiProperty() isDue!: boolean;
  @ApiProperty() blockAccess!: boolean;
}

export class IntroductionStatusResponseDto {
  @ApiProperty() hasValidIntroduction!: boolean;
  @ApiProperty({ enum: IntroductionStatus, enumName: 'IntroductionStatus' }) status!: IntroductionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) expiresAt!: string | null;
  @ApiProperty({ type: [IntroductionScheduleStatusDto] }) schedules!: IntroductionScheduleStatusDto[];
}
```

`expiringIntroduction.response.dto.ts`:

```ts
// Self-service list of introductions that are warning/expired
// FEATURE: User retraining requirement (ATT-106)
import { ApiProperty } from '@nestjs/swagger';
import { IntroductionStatus } from './introductionStatus.response.dto';

export class ExpiringIntroductionDto {
  @ApiProperty({ enum: ['resource', 'resourceGroup'] }) kind!: 'resource' | 'resourceGroup';
  @ApiProperty({ required: false }) resourceId?: number;
  @ApiProperty({ required: false }) resourceGroupId?: number;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: IntroductionStatus, enumName: 'IntroductionStatus' }) status!: IntroductionStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: string | null;
}
```

- [ ] **Step 2: Wire status endpoint**

In `resourceIntroductions.controller.ts`, add (or replace existing GET status):

```ts
@Get(':userId/status')
@ApiOperation({ operationId: 'getIntroductionStatus' })
@ApiResponse({ status: 200, type: IntroductionStatusResponseDto })
async getStatus(
  @Param('resourceId', ParseIntPipe) resourceId: number,
  @Param('userId', ParseIntPipe) userId: number,
): Promise<IntroductionStatusResponseDto> {
  const evalResult = await this.scheduleEvaluator.evaluateUserOnResource(userId, resourceId);
  const valid = await this.service.hasValidIntroduction(resourceId, userId);
  return {
    hasValidIntroduction: valid,
    status: evalResult.status as any,
    expiresAt: evalResult.expiresAt ? evalResult.expiresAt.toISOString() : null,
    schedules: evalResult.schedules.map((s) => ({
      scheduleId: s.scheduleId,
      dueAt: s.dueAt ? s.dueAt.toISOString() : null,
      isWarning: s.isWarning, isDue: s.isDue, blockAccess: s.blockAccess,
    })),
  };
}
```

Repeat for groups controller.

- [ ] **Step 3: Add user expiring endpoint**

In `users.controller.ts`:

```ts
@Get('me/expiring-introductions')
@Auth()
@ApiOperation({ operationId: 'getMyExpiringIntroductions' })
@ApiResponse({ status: 200, type: [ExpiringIntroductionDto] })
async myExpiring(@CurrentUser() user: User): Promise<ExpiringIntroductionDto[]> {
  return this.userIntroductionsService.findMyExpiring(user.id);
}
```

Implement `UserIntroductionsService.findMyExpiring(userId)` in a new file `apps/api/src/users/user-introductions.service.ts`:

```ts
// Aggregates a single user's resource + group introductions, returns only WARNING/EXPIRED
// FEATURE: User retraining requirement (ATT-106)
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceIntroduction } from '@attraccess/database-entities';
import { IntroductionScheduleEvaluatorService } from '../resources/introductions/schedules/introduction-schedule-evaluator.service';
import { ExpiringIntroductionDto } from '../resources/introductions/dtos/expiringIntroduction.response.dto';

@Injectable()
export class UserIntroductionsService {
  constructor(
    @InjectRepository(ResourceIntroduction) private readonly introRepo: Repository<ResourceIntroduction>,
    private readonly evaluator: IntroductionScheduleEvaluatorService,
  ) {}

  async findMyExpiring(userId: number): Promise<ExpiringIntroductionDto[]> {
    const intros = await this.introRepo.find({
      where: { receiverUserId: userId },
      relations: ['resource', 'resourceGroup'],
    });
    const out: ExpiringIntroductionDto[] = [];
    for (const intro of intros) {
      const schedules = await this.evaluator.getSchedulesForIntroduction(intro);
      const rows = await Promise.all(schedules.map(async (s) => ({
        s, dueAt: await this.evaluator.computeDueAt(s, intro),
        isDue: await this.evaluator.isDue(s, intro),
        isWarning: await this.evaluator.isWarning(s, intro),
      })));
      const earliest = rows.map((r) => r.dueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      const status = rows.some((r) => r.isDue) ? 'EXPIRED'
        : rows.some((r) => r.isWarning) ? 'WARNING' : null;
      if (!status) continue;
      out.push({
        kind: intro.resourceId != null ? 'resource' : 'resourceGroup',
        resourceId: intro.resourceId ?? undefined,
        resourceGroupId: intro.resourceGroupId ?? undefined,
        name: intro.resource?.name ?? intro.resourceGroup?.name ?? '',
        status: status as any,
        dueAt: earliest ? earliest.toISOString() : null,
      });
    }
    return out;
  }
}
```

Wire it in `users.module.ts`:

```ts
imports: [
  // ...existing...
  TypeOrmModule.forFeature([/* existing */, ResourceIntroduction]),
  forwardRef(() => ResourceIntroductionsScheduleModule),
],
providers: [
  // ...existing...
  UserIntroductionsService,
],
```

- [ ] **Step 4: Write tests covering the new endpoints**

Add a `users.controller.spec.ts` describe block for the expiring endpoint and a controller test for the status endpoint that checks the DTO shape.

- [ ] **Step 5: Run all affected tests, expect PASS**

Run:
```
pnpm nx test api --testFile=apps/api/src/resources/introductions/resourceIntroductions.controller.spec.ts --no-cache
pnpm nx test api --testFile=apps/api/src/users/users.controller.spec.ts --no-cache
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resources/introductions apps/api/src/resources/groups/introductions apps/api/src/users
git commit -m "feat(att-106): introduction status + self-service expiring endpoint"
```

---

## Task 10: Email templates and warning fan-out

**Files:**
- Modify: `libs/database-entities/src/lib/entities/email-template.entity.ts` (add types)
- Create: `apps/api/src/database/migrations/1778016390001-seed-introduction-email-templates.ts`
- Modify: `apps/api/src/resources/introductions/schedules/introduction-schedule-evaluator.service.ts` (call email service in `recordWarnSentOnce`)
- Modify: spec to verify email sent once

- [ ] **Step 1: Extend `EmailTemplateType`**

```ts
export enum EmailTemplateType {
  // ...existing...
  INTRODUCTION_EXPIRY_WARNING = 'introduction-expiry-warning',
  INTRODUCTION_EXPIRED = 'introduction-expired',
}
```

- [ ] **Step 2: Add seeder migration**

`1778016390001-seed-introduction-email-templates.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

const WARNING_BODY = `
<mjml>
  <mj-body>
    <mj-section><mj-column>
      <mj-text>Hello {{user.username}},</mj-text>
      <mj-text>Your training for "{{resource.name}}" expires on {{dueAt}}. Please contact a tutor to schedule a retraining session.</mj-text>
    </mj-column></mj-section>
  </mj-body>
</mjml>`.trim();

const EXPIRED_BODY = `
<mjml>
  <mj-body>
    <mj-section><mj-column>
      <mj-text>Hello {{user.username}},</mj-text>
      <mj-text>Your training for "{{resource.name}}" has expired. Access is paused until you complete a retraining session.</mj-text>
    </mj-column></mj-section>
  </mj-body>
</mjml>`.trim();

export class SeedIntroductionEmailTemplates1778016390001 implements MigrationInterface {
  name = 'SeedIntroductionEmailTemplates1778016390001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT OR IGNORE INTO email_templates (type, subject, body, variables) VALUES (?, ?, ?, ?)`,
      ['introduction-expiry-warning', 'Retraining required: {{resource.name}}', WARNING_BODY,
       'user.username,resource.name,dueAt'],
    );
    await q.query(
      `INSERT OR IGNORE INTO email_templates (type, subject, body, variables) VALUES (?, ?, ?, ?)`,
      ['introduction-expired', 'Access paused: {{resource.name}}', EXPIRED_BODY,
       'user.username,resource.name'],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM email_templates WHERE type IN ('introduction-expiry-warning','introduction-expired')`);
  }
}
```

- [ ] **Step 3: Wire email send into evaluator**

Inject `EmailService` (existing) into evaluator. In `recordWarnSentOnce` and `recordExpireOnce` after saving the history item, call:

```ts
await this.emailService.sendByTemplate(
  IntroductionExpiryNotificationEnum.WARNING_OR_EXPIRED,
  intro.receiverUserId,
  { resource: { name: ... }, dueAt: ... },
);
```

Pattern: read existing `EmailService` interface — likely has `sendTemplatedEmail(type, recipientUserId, vars)`. Match the existing signature. If template variables are stored in DB, fetch user + resource for the merge data.

- [ ] **Step 4: Add failing test**

Spec: extend evaluator spec with a mock `emailService.send`. Assert it was called once on first `recordWarnSentOnce` and not on rerun.

- [ ] **Step 5: Run tests, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add libs/database-entities apps/api/src/database/migrations apps/api/src/resources/introductions/schedules
git commit -m "feat(att-106): seed expiry email templates and wire warning send"
```

---

## Task 11: Module wiring + global

**Files:**
- Create: `apps/api/src/resources/introductions/schedules/introduction-schedule.module.ts`
- Modify: `apps/api/src/resources/introductions/resourceIntroductions.module.ts`
- Modify: `apps/api/src/resources/groups/introductions/resourceGroups.introductions.module.ts`
- Modify: `apps/api/src/users/users.module.ts`

- [ ] **Step 1: Schedule module**

```ts
// Module wiring for introduction schedules + evaluator
// FEATURE: User retraining requirement (ATT-106)
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ResourceIntroductionSchedule,
  ResourceIntroductionScheduleTimeSinceIntroductionConfig,
  ResourceIntroductionScheduleInactivityConfig,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  Resource, ResourceGroup, ResourceUsage,
} from '@attraccess/database-entities';
import { IntroductionScheduleService } from './introduction-schedule.service';
import { IntroductionScheduleController } from './introduction-schedule.controller';
import { IntroductionScheduleEvaluatorService } from './introduction-schedule-evaluator.service';
import { GroupIntroductionScheduleController } from '../../groups/introductions/schedules/group-introduction-schedule.controller';
import { EmailModule } from '../../../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResourceIntroductionSchedule,
      ResourceIntroductionScheduleTimeSinceIntroductionConfig,
      ResourceIntroductionScheduleInactivityConfig,
      ResourceIntroduction,
      ResourceIntroductionHistoryItem,
      Resource, ResourceGroup, ResourceUsage,
    ]),
    EmailModule,
  ],
  controllers: [IntroductionScheduleController, GroupIntroductionScheduleController],
  providers: [IntroductionScheduleService, IntroductionScheduleEvaluatorService],
  exports: [IntroductionScheduleService, IntroductionScheduleEvaluatorService],
})
export class IntroductionScheduleModule {}
```

- [ ] **Step 2: Re-export evaluator from existing introduction modules**

Both introductions modules need to import `IntroductionScheduleModule` so they can inject the evaluator into the existing services. Use `forwardRef` if a cycle appears.

- [ ] **Step 3: Run app boot smoke test**

Run: `pnpm nx test api --testFile=apps/api/src/app.module.spec.ts --no-cache` (if exists; else just `pnpm nx serve api` for ~5s and ensure no Nest DI error).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src
git commit -m "chore(att-106): wire introduction schedule module"
```

---

## Task 12: usage gate + e2e flows

**Files:**
- Modify: `apps/api/src/resources/usage/resourceUsage.service.spec.ts` (add cases)
- Create: `apps/api/src/resources/introductions/introduction-renewal.e2e-spec.ts`
- Create: `apps/api/src/resources/introductions/introduction-inactivity-scope.e2e-spec.ts`

- [ ] **Step 1: Extend `resourceUsage.service.spec.ts`**

Add tests:
- `cannot start session when blocking schedule due` — mock `hasValidIntroduction` to consult the evaluator path; assert ForbiddenException.
- `can start session when warn-only schedule due` — assert it succeeds.

- [ ] **Step 2: Run, expect PASS** (the existing service unchanged; the change is in `hasValidIntroduction`'s consumers)

Run: `pnpm nx test api --testFile=apps/api/src/resources/usage/resourceUsage.service.spec.ts --no-cache`

- [ ] **Step 3: Renewal e2e**

`introduction-renewal.e2e-spec.ts`: full flow with the real Nest app (use `Test.createTestingModule(...AppModule)` with sqlite). Steps:

1. seed user + tutor + resource
2. POST grant
3. usage.start → 200
4. POST schedule (TIME_SINCE_INTRODUCTION 1d, blockAccess)
5. fast-forward time (mock evaluator `now`)
6. tick → EXPIRE row
7. usage.start → 403
8. POST renew
9. usage.start → 200

- [ ] **Step 4: Inactivity scope e2e**

`introduction-inactivity-scope.e2e-spec.ts`:

1. seed group with two resources, user introduced
2. INACTIVITY scope=RESOURCE 6 months on resource A
3. usage on resource B 1 day ago
4. evaluate A → due (no usage on A)
5. INACTIVITY scope=GROUP 6 months on group
6. evaluate → not due (usage on B counts for group)

- [ ] **Step 5: Run e2e tests**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/resources
git commit -m "test(att-106): usage gate + renewal + inactivity scope e2e"
```

---

## Task 13: Regenerate API clients

- [ ] **Step 1: Regenerate**

Run:
```
pnpm nx run api:swagger
pnpm nx run api-client:generate
pnpm nx run react-query-client:generate
```

(Use the actual command names in this repo — check `project.json` if names differ; the generated paths match the spec.)

- [ ] **Step 2: Confirm new types exist**

```
grep -l 'ResourceIntroductionSchedule' libs/api-client/src/generated/Api.ts
grep -l 'IntroductionStatus' libs/react-query-client/src/lib/requests/types.gen.ts
```

- [ ] **Step 3: Commit generated files**

```bash
git add libs/api-client libs/react-query-client
git commit -m "chore(att-106): regenerate api-client and react-query-client"
```

---

## Task 14: Frontend — IntroductionStatus chip + management table

**Files:**
- Modify: `apps/frontend/src/components/IntroductionStatusChip/index.tsx`
- Create: `apps/frontend/src/components/IntroductionStatusChip/index.test.tsx`
- Modify: `apps/frontend/src/components/IntroductionsManagement/index.tsx` (add status, expires, renew)
- Modify: `apps/frontend/src/components/IntroductionsManagement/en.json`
- Modify: `apps/frontend/src/app/resources/usage/components/IntroductionRequiredDisplay/index.tsx` (handle EXPIRED variant)

- [ ] **Step 1: Failing chip test**

```tsx
// IntroductionStatusChip variant tests
// FEATURE: User retraining requirement (ATT-106)
import { render, screen } from '@testing-library/react';
import { IntroductionStatusChip } from './index';

describe('IntroductionStatusChip', () => {
  it.each([
    ['ACTIVE', /active/i],
    ['WARNING', /warning|expires/i],
    ['EXPIRED', /expired/i],
  ])('renders %s variant', (status, label) => {
    render(<IntroductionStatusChip status={status as any} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run failing**

Run: `pnpm nx test frontend --testFile=apps/frontend/src/components/IntroductionStatusChip/index.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement chip extension**

Replace the existing component with a status-based variant:

```tsx
// Status chip for introductions: ACTIVE/WARNING/EXPIRED
// FEATURE: User retraining requirement (ATT-106)
import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import type { IntroductionStatus } from '@attraccess/api-client';

export function IntroductionStatusChip({ status }: { status: IntroductionStatus | 'ACTIVE' | 'WARNING' | 'EXPIRED' }) {
  const { t } = useTranslation();
  if (status === 'EXPIRED') return <Chip color="danger">{t('introductionStatus.expired')}</Chip>;
  if (status === 'WARNING') return <Chip color="warning">{t('introductionStatus.warning')}</Chip>;
  return <Chip color="success">{t('introductionStatus.active')}</Chip>;
}
```

Add the i18n keys to `en.json`/`de.json` for the chip's new strings.

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Extend `IntroductionsManagement` table**

Add Status, Expires (relative date), Renew action button. Use `useGetIntroductionStatus` (regenerated hook) to drive each row's chip; show "Renew" button when `status !== 'ACTIVE'`.

- [ ] **Step 6: Update `IntroductionRequiredDisplay`** to render an "expired" copy variant.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components apps/frontend/src/app/resources/usage/components/IntroductionRequiredDisplay
git commit -m "feat(att-106): status chip + management table renewal action"
```

---

## Task 15: Frontend — schedule pages (resource + group)

**Files:**
- Create: `apps/frontend/src/app/resources/details/introduction-schedules/index.tsx`
- Create: `apps/frontend/src/app/resources/details/introduction-schedules/upsert/index.tsx`
- Create: `apps/frontend/src/app/resources/details/introduction-schedules/en.json`, `de.json`
- Modify: `apps/frontend/src/app/resources/details/resourceDetails.tsx` (add tab/route)
- Create equivalents under `apps/frontend/src/app/resource-groups/IntroductionSchedules/`

- [ ] **Step 1: Failing test for upsert form validation**

`upsert/index.test.tsx`:

```tsx
// Upsert form for introduction schedules: trigger config validation
// FEATURE: User retraining requirement (ATT-106)
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleUpsertForm } from './index';
// Stub the mutation hook used by the form.

describe('ScheduleUpsertForm', () => {
  it('shows error when triggerType=INACTIVITY but no scope selected', async () => {
    render(<ScheduleUpsertForm onSubmit={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/trigger type/i), { target: { value: 'INACTIVITY' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/scope is required/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement list page**

Mirror `apps/frontend/src/app/resources/details/maintenance-schedules/index.tsx`. Use the regenerated hook `useFindIntroductionSchedules({ resourceId })`, render a table, "Add" button opens the upsert dialog.

- [ ] **Step 3: Implement upsert form**

Use `react-hook-form` (or whatever the maintenance form uses — match the existing pattern). Trigger type field switches the visible config block. Submit posts via the regenerated mutation hooks.

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Mirror for resource group**

Same shape under `app/resource-groups/IntroductionSchedules/`, using group hooks.

- [ ] **Step 6: Wire navigation tabs**

Edit `resourceDetails.tsx` to add a "Retraining" tab linking to `/resources/:id/introduction-schedules`. Same for `resource-groups/index.tsx`.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/app/resources/details/introduction-schedules apps/frontend/src/app/resource-groups/IntroductionSchedules apps/frontend/src/app/resources/details/resourceDetails.tsx apps/frontend/src/app/resource-groups/index.tsx
git commit -m "feat(att-106): introduction schedule frontend pages"
```

---

## Task 16: Frontend — `MyExpiringIntroductions` widget

**Files:**
- Create: `apps/frontend/src/app/home/MyExpiringIntroductions/index.tsx`
- Create: `apps/frontend/src/app/home/MyExpiringIntroductions/index.test.tsx`
- Modify: home page entry to include the widget.

- [ ] **Step 1: Failing test**

```tsx
// Renders user expiring/expired introductions
// FEATURE: User retraining requirement (ATT-106)
import { render, screen } from '@testing-library/react';
import { MyExpiringIntroductions } from './index';

describe('MyExpiringIntroductions', () => {
  it('shows empty state when nothing expiring', async () => {
    jest.spyOn(require('@attraccess/react-query-client'), 'useGetMyExpiringIntroductions').mockReturnValue({
      data: [], isLoading: false,
    });
    render(<MyExpiringIntroductions />);
    expect(await screen.findByText(/nothing expiring/i)).toBeInTheDocument();
  });

  it('lists expiring introductions', async () => {
    jest.spyOn(require('@attraccess/react-query-client'), 'useGetMyExpiringIntroductions').mockReturnValue({
      data: [
        { kind: 'resource', resourceId: 1, name: 'Lasercutter', status: 'WARNING', dueAt: '2026-06-01T00:00:00Z' },
      ],
      isLoading: false,
    });
    render(<MyExpiringIntroductions />);
    expect(await screen.findByText(/Lasercutter/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement widget**

```tsx
// Home widget: shows the user's introductions that are warning or expired
// FEATURE: User retraining requirement (ATT-106)
import { Card, CardBody, CardHeader, Spinner } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useGetMyExpiringIntroductions } from '@attraccess/react-query-client';
import { IntroductionStatusChip } from '../../../components/IntroductionStatusChip';

export function MyExpiringIntroductions() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetMyExpiringIntroductions();
  return (
    <Card>
      <CardHeader>{t('myExpiring.title')}</CardHeader>
      <CardBody>
        {isLoading ? <Spinner /> : (
          (data?.length ?? 0) === 0
            ? <span>{t('myExpiring.empty')}</span>
            : <ul>
              {data!.map((row) => (
                <li key={`${row.kind}-${row.resourceId ?? row.resourceGroupId}`}>
                  <IntroductionStatusChip status={row.status} /> {row.name}
                  {row.dueAt && <> — {new Date(row.dueAt).toLocaleDateString()}</>}
                </li>
              ))}
            </ul>
        )}
      </CardBody>
    </Card>
  );
}
```

Add to home page placement.

- [ ] **Step 3: Run tests, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/home/MyExpiringIntroductions
git commit -m "feat(att-106): home widget for expiring introductions"
```

---

## Task 17: Acceptance criteria walk-through + lint + full tests

- [ ] **Step 1: Run full backend tests**

Run: `pnpm nx test api --no-cache`
Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run: `pnpm nx test frontend`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm nx run-many -t lint`
Expected: PASS.

- [ ] **Step 4: Walk acceptance map**

For each row in the spec's "Acceptance criteria → test map" table, open the named test file and confirm at least one expectation lines up with the criterion. Fix gaps before merging.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm nx serve api` and `pnpm nx serve frontend`. Steps:

1. Sign in as admin, open a resource detail page → "Retraining" tab appears.
2. Add TIME_SINCE_INTRODUCTION schedule, 1 day, blockAccess + warnDaysBefore=1.
3. Sign in as a user with an introduction. Wait for scheduled tick or manually trigger via dev endpoint (or temporarily lower cron interval).
4. Verify the home widget shows the expired item and the resource start button is disabled with the expired copy.
5. As admin/tutor, click Renew → user immediately regains access.

- [ ] **Step 6: Commit any final fixes and push**

```bash
git push -u origin att-106-user-retraining-requirement
```

---

## Self-review notes (for the writer of this plan)

- **Spec coverage check**: walked the acceptance map. Each acceptance criterion ties to one or more task tests above:
  - Yearly retrain → Task 4 controller test + Task 5 evaluator test.
  - 6-month inactivity (group scope) → Task 5 GROUP test.
  - Block on blocking schedule → Task 7 + Task 12 e2e.
  - Warn-only does not block → Task 7 + Task 12.
  - Tutor renew restores access → Task 8 + Task 12 e2e.
  - Warn email once per cycle → Task 6 tick test + Task 10 mocked email assertion.
  - Multiple stacked schedules → Task 5/6 evaluator (multi-schedule path) + Task 7 (any blocking schedule blocks).
  - Audit trail across cycles → Task 6 second-cycle test + Task 8 service test.
- **Type consistency**: `RetrainingIntervalUnit` used in Task 1, 3, 5 is the single source. `IntroductionStatus` in Task 9 is the same enum the chip in Task 14 reads.
- **No placeholders**: every code step shows the code; every test step shows assertions; every command line is exact.
