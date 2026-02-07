# Work Item 02: Maintenance Schedule Trigger Types

## Goal
Define the trigger types and their configuration schemas for maintenance schedules. This is schema/contract and validation only; no evaluation or auto-creation of maintenance records yet (that is work item 03).

## Context
- Work item 01 introduces `ResourceMaintenanceSchedule` with `triggerType` and `triggerConfig` (JSON).
- **Usage data**: Resource usage sessions are in `ResourceUsage` with `startTime`, `endTime`, and stored `usageInMinutes` (see `libs/database-entities/src/lib/entities/resourceUsage.entity.ts`). Aggregates (e.g. sum of minutes per resource) are computed in services (e.g. `apps/api/src/projects/project-usage.service.ts`).
## Trigger types (three)

- **USAGE_HOURS** – Trigger after N minutes of resource usage. Baseline is always when the last maintenance created by this schedule was marked done.
- **USAGE_COUNT** – Trigger after N usage sessions. Baseline is always when the last maintenance created by this schedule was marked done.
- **TIME_INTERVAL** – Time-based; supports two modes:
  - **Recurring**: e.g. every 30 days (`intervalDays`). Baseline = when last maintenance for this schedule was done.
  - **Wall-clock threshold**: trigger after N hours have passed (`thresholdHours`). Baseline = when last maintenance for this schedule was done.

## Tasks (for executing agent)

### 1. Trigger type enum
- **Location**: In database-entities alongside `ResourceMaintenanceSchedule` (work item 01 may already define it). Values: `USAGE_HOURS`, `USAGE_COUNT`, `TIME_INTERVAL`. Ensure `resource_maintenance_schedule.triggerType` uses this enum (migration if needed).

### 2. Trigger config schemas (Zod or DTOs)
- **Location**: Either in database-entities (Zod) or in API DTOs (class-validator). Prefer a single source of truth (e.g. Zod in lib, then DTOs/validation in API that mirror it). Config entities may already define the shape (normalized tables per trigger type).
- **USAGE_HOURS**: `{ thresholdMinutes: number }`. Baseline = when the last maintenance created by this schedule was marked done.
- **USAGE_COUNT**: `{ thresholdSessions: number }`. Baseline = when the last maintenance created by this schedule was marked done.
- **TIME_INTERVAL**: One of:
  - Recurring: `{ intervalDays: number }` (e.g. every 30 days). Baseline = when last maintenance for this schedule was done.
  - Wall-clock threshold: `{ thresholdHours: number }`. Baseline = when last maintenance for this schedule was done.
  - Validation: require either `intervalDays` or `thresholdHours`; document both shapes.
- Document that baseline is always “last maintenance for this schedule” (that maintenance’s `endTime` / completed-at).

### 3. Validation in API
- When creating/updating a schedule (API to be added in a later work item), validate `triggerConfig` against the schema for the given `triggerType`. For this work item, adding a shared validation function or schema in the maintenance module is enough so that future CRUD can use it.
- Optionally add `getTriggerConfigSchema(triggerType)` returning the right schema for validation.

### 4. Documentation
- Add JSDoc or a short README in the maintenance area describing each trigger type and its config shape so that frontend and evaluation service can rely on it.

## Code references
- Usage entity (minutes, sessions): `libs/database-entities/src/lib/entities/resourceUsage.entity.ts`
- Resource usage query examples: `apps/api/src/projects/project-usage.service.ts`, `apps/api/src/resources/usage/resourceUsage.service.ts`
- Flow node data schemas (pattern): `libs/database-entities/src/lib/entities/resourceFlowNode.ts` (Zod schemas per type)

## Dependencies
- Work item 01 (ResourceMaintenanceSchedule and ResourceMaintenance with optional schedule link).

## Out of scope
- Actually evaluating schedules or creating maintenance records (work item 03).
- API endpoints or UI for creating schedules (work item 07).

## Acceptance criteria
- Trigger type enum is defined and used by `ResourceMaintenanceSchedule` (USAGE_HOURS, USAGE_COUNT, TIME_INTERVAL).
- Each trigger type has a defined config schema and validation; invalid config is rejected.
- TIME_INTERVAL supports both recurring (intervalDays) and wall-clock threshold (thresholdHours) configs. Baseline is always last maintenance done for this schedule.
- Docs or JSDoc describe each type and config for other agents.
