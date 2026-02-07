# Work Item 01: Maintenance Schedules Data Model

## Goal
Introduce a data model for **maintenance schedules** (configuration that defines when maintenance is due) and extend the existing **maintenance record** model with audit fields (who performed/completed maintenance and when). This work item is foundational; other work items depend on it.

## Context
- **Existing manual maintenances**: `ResourceMaintenance` entity and `resource_maintenance` table store manual maintenance windows (start/end time, reason, resourceId). See `libs/database-entities/src/lib/entities/resource.maintenance.ts` and migration `apps/api/src/database/migrations/1754061071643-resource-maintenance.ts`.
- **Resource relation**: `Resource` has `maintenances: ResourceMaintenance[]` in `libs/database-entities/src/lib/entities/resource.entity.ts`.
- **No schedule concept yet**: There is no entity for "when maintenance should be triggered" (e.g. every 100 usage hours, every 30 days). Schedules will drive automatic creation of maintenance records later.

## Tasks (for executing agent)

### 1. Create `ResourceMaintenanceSchedule` entity
- **Location**: `libs/database-entities/src/lib/entities/` (new file, e.g. `resource-maintenance-schedule.entity.ts`).
- **Fields** (suggested; refine as needed):
  - `id`, `createdAt`, `updatedAt`
  - `resourceId` (FK to Resource)
  - `name` (optional human-readable label)
  - `triggerType`: enum (e.g. `USAGE_HOURS`, `USAGE_COUNT`, `TIME_INTERVAL`). `TIME_INTERVAL` covers both recurring (e.g. every N days) and one-off wall-clock threshold (e.g. after N hours).
  - `triggerConfig`: JSON column for type-specific config (thresholds, intervals, etc.) — or normalized config entities per trigger type.
  - `enabled`: boolean, default true
- **Relation**: Resource has one-to-many `maintenanceSchedules: ResourceMaintenanceSchedule[]`. Add to `Resource` entity and export from `libs/database-entities` (entities-index / public API).

### 2. Extend `ResourceMaintenance` with audit fields
- **File**: `libs/database-entities/src/lib/entities/resource.maintenance.ts`
- **Add** (nullable where appropriate):
  - `createdByUserId` or `performedByUserId` (FK to User) – who created/started the maintenance record.
  - `completedByUserId` (FK to User, nullable) – who marked it as done.
  - `completedAt` (datetime, nullable) – when it was marked done (can align with existing `endTime` or be separate for audit clarity).
  - Optional: `maintenanceScheduleId` (FK to ResourceMaintenanceSchedule, nullable) – which schedule triggered this record (null for manual).
- **Existing fields** to keep: `id`, `createdAt`, `updatedAt`, `resourceId`, `resource`, `startTime`, `endTime`, `reason`.

### 3. Database migrations
- **Location**: `apps/api/src/database/migrations/`.
- Create migration(s):
  - New table `resource_maintenance_schedule` with the columns above and FK to `resource`. Follow existing migration style (e.g. SQLite as in `1754061071643-resource-maintenance.ts`).
  - Alter `resource_maintenance`: add `createdByUserId` / `performedByUserId`, `completedByUserId`, `completedAt`, and optionally `maintenanceScheduleId` with FKs where needed.
- Register migration in `apps/api/src/database/migrations/index.ts` if required by the project.

### 4. Export and TypeORM registration
- Export new entity from `libs/database-entities` (e.g. `entities-index.ts`).
- Ensure `ResourceMaintenanceModule` (or the module that owns maintenance) registers the new entity with TypeORM: `TypeOrmModule.forFeature([..., ResourceMaintenanceSchedule])` in `apps/api/src/resources/maintenances/maintenance.module.ts`.

## Code references
- Entity: `libs/database-entities/src/lib/entities/resource.maintenance.ts`
- Resource entity (relations): `libs/database-entities/src/lib/entities/resource.entity.ts`
- Migration example: `apps/api/src/database/migrations/1754061071643-resource-maintenance.ts`
- Maintenance module: `apps/api/src/resources/maintenances/maintenance.module.ts`

## Out of scope for this item
- Trigger type semantics and evaluation logic (see work items 02, 03).
- API or UI for schedules (later work items).
- Filling `performedByUserId` / `completedByUserId` in services (work items 05, 06).

## Acceptance criteria
- New entity `ResourceMaintenanceSchedule` exists and is registered in TypeORM and exported from database-entities.
- `ResourceMaintenance` has new audit columns and optional `maintenanceScheduleId`; migrations run successfully.
- No breaking change to existing manual maintenance create/update/finish flows (new fields nullable).

---

## Progress notes (implementation)

**Status:** Done.

**Completed:**

1. **`ResourceMaintenanceSchedule` entity**  
   - New file: `libs/database-entities/src/lib/entities/resource-maintenance-schedule.entity.ts`.  
   - Fields: `id`, `createdAt`, `updatedAt`, `resourceId`, `name` (nullable), `triggerType` (enum), `triggerConfig` (json, nullable), `enabled` (default true).  
   - Enum `ResourceMaintenanceScheduleTriggerType`: `USAGE_HOURS`, `USAGE_COUNT`, `TIME_INTERVAL`. `TIME_INTERVAL` covers recurring and wall-clock threshold (merged from former REAL_HOURS).  
   - Relation: `Resource` has `maintenanceSchedules: ResourceMaintenanceSchedule[]` in `resource.entity.ts`.

2. **`ResourceMaintenance` extended**  
   - File: `libs/database-entities/src/lib/entities/resource.maintenance.ts`.  
   - Added relations (TypeORM creates FK columns): `createdByUser` → `createdByUserId` (nullable), `completedByUser` → `completedByUserId` (nullable), `maintenanceSchedule` → `maintenanceScheduleId` (nullable).  
   - Added column: `completedAt` (datetime, nullable).  
   - All new fields nullable so existing manual maintenance flows are unchanged.

3. **Migrations**  
   - New migration: `apps/api/src/database/migrations/1770300000000-maintenance-schedules-and-audit.ts`.  
   - Creates table `resource_maintenance_schedule` with FK to `resource`.  
   - Recreates `resource_maintenance` with new columns and FKs to `user` and `resource_maintenance_schedule` (SQLite temp-table pattern).  
   - Migration registered in `apps/api/src/database/migrations/index.ts`.  
   - `api:migrations-run` executed successfully.

4. **Exports and registration**  
   - `ResourceMaintenanceSchedule` and `ResourceMaintenanceScheduleTriggerType` exported from `libs/database-entities/src/lib/entities-index.ts` (named exports and `entities` object).  
   - `ResourceMaintenanceModule` updated: `TypeOrmModule.forFeature([..., ResourceMaintenanceSchedule])` in `apps/api/src/resources/maintenances/maintenance.module.ts`.

5. **Fixture**  
   - `apps/api/src/test-utils/resource.fixtures.ts`: added `maintenanceSchedules: []` to `createMockResource` so the build (migration datasource) passes.

**Notes for follow-up work items:**

- Audit fields are on the entity only; services do not set `createdByUser` / `completedByUser` / `completedAt` yet (see items 05, 06).  
- Schedule evaluation and trigger semantics are out of scope (items 02, 03, 04).
