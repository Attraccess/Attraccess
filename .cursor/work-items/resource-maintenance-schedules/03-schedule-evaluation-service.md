# Work Item 03: Maintenance Schedule Evaluation Service

## Goal
Implement the logic that evaluates maintenance schedules and automatically creates a `ResourceMaintenance` record when a schedule’s condition is met. The resource then enters “maintenance mode” (existing behavior: `hasActiveMaintenance` is true until the maintenance is marked done).

## Context
- **Schedules**: Work item 01 adds `ResourceMaintenanceSchedule`; work item 02 defines trigger types and configs.
- **Active maintenance**: `ResourceMaintenanceService.hasActiveMaintenance(resourceId)` returns true when there is a row with `resourceId`, `startTime <= now`, and `endTime IS NULL` (`apps/api/src/resources/maintenances/maintenance.service.ts`).
- **Usage blocking**: `ResourceUsageService.getResource()` checks `hasActiveMaintenance` and `canManageMaintenance`; non–maintenance users cannot start a session during active maintenance (`apps/api/src/resources/usage/resourceUsage.service.ts`, ~lines 133–158).
- **Events**: Creating/updating maintenance emits `ResourceMaintenanceChangedEvent` (`apps/api/src/resources/maintenances/events/resource-maintenance-changed.event.ts`).

## Tasks (for executing agent)

### 1. Schedule evaluation service
- **Location**: e.g. `apps/api/src/resources/maintenances/maintenance-schedule-evaluator.service.ts` (or inside `ResourceMaintenanceService` if preferred). Should be injectable and testable.
- **Responsibilities**:
  - For a given resource (or for all resources with enabled schedules), evaluate each enabled schedule:
    - **USAGE_HOURS**: Sum usage minutes from `ResourceUsage` for that resource since the last maintenance created by this schedule was marked done. If sum >= threshold, trigger.
    - **USAGE_COUNT**: Count sessions since the last maintenance created by this schedule was marked done. If count >= threshold, trigger.
    - **TIME_INTERVAL**: Two modes:
      - **Recurring** (config has `intervalDays`): next due = (when last maintenance for this schedule was done) + interval; if now >= next due, trigger.
      - **Wall-clock threshold** (config has `thresholdHours`): elapsed wall-clock hours since last maintenance for this schedule was done; if elapsed >= thresholdHours, trigger.
    - “Last maintenance for this schedule” = latest `ResourceMaintenance` for that resource with `maintenanceScheduleId` = this schedule’s id and `endTime` not null (or `completedAt`), ordered by end desc. If none, use resource creation date as baseline (first time).
  - If a schedule triggers and there is **no** current active maintenance for that resource, create one:
    - Create `ResourceMaintenance`: `resourceId`, `startTime = now`, `endTime = null`, `reason` from schedule (e.g. “Auto: 100 usage hours reached”), optional `maintenanceScheduleId`, optional `createdByUserId` (null for system).
  - If a schedule triggers but there is already an active maintenance, skip (do not create a duplicate).
- **Idempotency**: Only create when no active maintenance exists for that resource.

### 2. When to run evaluation
- **Option A – Cron**: Add a scheduled job (e.g. `@Cron` in NestJS) that runs every N minutes and evaluates all resources with enabled schedules. Use a small lock or “last evaluated” to avoid thundering herd.
- **Option B – Event-driven**: On events that affect usage (e.g. session ended), evaluate schedules for that resource only. Can be combined with a periodic cron for TIME_INTERVAL.
- Implement at least one of these; document the choice. Recommendation: cron for simplicity, plus optional event-driven for immediate reaction after usage.

### 3. Integration with existing service
- Reuse `ResourceMaintenanceService.createMaintenance()` or add an internal method that creates a maintenance record with optional `maintenanceScheduleId` and system-generated reason. Emit `ResourceMaintenanceChangedEvent` so existing listeners (e.g. frontend) stay in sync.
- Ensure `ResourceMaintenanceService.hasActiveMaintenance()` remains the single source of truth for “is resource in maintenance mode”.

### 4. Tests
- Unit tests for the evaluator: mock repositories, set up usage/maintenance data, assert that when threshold is met a maintenance is created and when not met it is not.
- Edge cases: no previous maintenance for this schedule (use resource creation date as baseline), multiple schedules (only one active at a time), schedule disabled.
- Cover at least one TIME_INTERVAL mode (recurring or wall-clock threshold) and one other type (e.g. USAGE_HOURS).

## Code references
- `ResourceMaintenanceService`: `apps/api/src/resources/maintenances/maintenance.service.ts` (`createMaintenance`, `hasActiveMaintenance`)
- `ResourceUsage` and usage queries: `libs/database-entities/src/lib/entities/resourceUsage.entity.ts`, `apps/api/src/resources/usage/resourceUsage.service.ts`, `apps/api/src/projects/project-usage.service.ts`
- Event: `apps/api/src/resources/maintenances/events/resource-maintenance-changed.event.ts`
- Cron example: `apps/api/src/resources/flows/resource-flows-executor.service.ts` (e.g. `@Cron` usage)

## Dependencies
- Work items 01 and 02 (schedule entity, trigger types, config schemas).

## Out of scope
- UI or API for schedules (work item 07).
- Audit fields population (work items 05, 06); evaluator can leave `createdByUserId` null for system-created maintenances.

## Acceptance criteria
- When a schedule’s condition is met and there is no active maintenance, a new `ResourceMaintenance` is created and event emitted.
- When there is already an active maintenance, no duplicate is created.
- TIME_INTERVAL is evaluated correctly for both recurring (intervalDays) and wall-clock threshold (thresholdHours) configs. Baseline is always last maintenance done for this schedule.
- Evaluation runs periodically (and optionally on usage events); tests cover at least one trigger type and edge cases.

---

## Progress notes (agent)

- **Done**: `MaintenanceScheduleEvaluatorService` added at `apps/api/src/resources/maintenances/maintenance-schedule-evaluator.service.ts`. Evaluates USAGE_HOURS (sum usage minutes since baseline), USAGE_COUNT (session count since baseline), TIME_INTERVAL (intervalDays and thresholdHours). Baseline = last completed maintenance for this schedule, or resource.createdAt.
- **Done**: `ResourceMaintenanceService.createMaintenanceFromSchedule(resourceId, scheduleId, reason)` added for system-created maintenances; emits `ResourceMaintenanceChangedEvent`.
- **Done**: Cron `@Cron(CronExpression.EVERY_5_MINUTES)` runs `evaluateAll()`; in-process lock prevents overlapping runs. Event-driven on session end not implemented; can be added later by calling `evaluateResource(resourceId)` from usage end handler.
- **Done**: Unit tests in `maintenance-schedule-evaluator.service.spec.ts` cover: getBaselineDate (no previous / with previous), evaluateResource with hasActiveMaintenance (no create), USAGE_HOURS threshold met/not met, TIME_INTERVAL intervalDays due, disabled schedule skipped, evaluateAll calls evaluateResource per resource.
