# Maintenance Schedule Trigger Types

This document describes the trigger types and their configuration for `ResourceMaintenanceSchedule`. Validation is done via **NestJS DTOs and class-validator** in the API. Use this for the evaluation service (work item 03) and frontend UI.

**Baseline**: For all trigger types, the baseline is always **when the last maintenance created by this schedule was marked done** (that maintenance’s `completedAt` or `endTime`). If no such maintenance exists yet, the baseline is the schedule’s creation or another agreed reference (e.g. resource creation).

---

## 1. USAGE_HOURS

Trigger after **N minutes of resource usage** since the baseline.

| Field              | Type   | Required | Description                                      |
|--------------------|--------|----------|--------------------------------------------------|
| `thresholdMinutes` | number | yes      | Trigger after this many minutes of usage (int, > 0). |

**Example**: `{ "thresholdMinutes": 6000 }` → trigger after 100 hours of usage.

**Validation**: DTO `UsageHoursTriggerConfigDto` in `apps/api/src/resources/maintenances/dtos/usage-hours-trigger-config.dto.ts`. Use `CreateMaintenanceScheduleDto` / `UpdateMaintenanceScheduleDto` with `triggerType: USAGE_HOURS` and `usageHoursConfig`; Nest’s `ValidationPipe` validates the payload.

---

## 2. USAGE_COUNT

Trigger after **N usage sessions** since the baseline.

| Field                | Type   | Required | Description                                           |
|----------------------|--------|----------|-------------------------------------------------------|
| `thresholdSessions`  | number | yes      | Trigger after this many usage sessions (int, > 0).   |

**Example**: `{ "thresholdSessions": 50 }` → trigger after 50 sessions.

**Validation**: DTO `UsageCountTriggerConfigDto` in `apps/api/src/resources/maintenances/dtos/usage-count-trigger-config.dto.ts`. Use create/update schedule DTOs with `triggerType: USAGE_COUNT` and `usageCountConfig`.

---

## 3. TIME_INTERVAL

Time-based trigger. **Exactly one** of the two modes must be set.

### 3a. Recurring (interval days)

| Field           | Type   | Required | Description                              |
|-----------------|--------|----------|------------------------------------------|
| `intervalDays`  | number | yes*     | Trigger every N days (int, > 0).        |

*Use this **or** `thresholdHours`, not both.

**Example**: `{ "intervalDays": 30 }` → trigger every 30 days after the last maintenance was done.

### 3b. Wall-clock threshold (hours)

| Field             | Type   | Required | Description                                                |
|-------------------|--------|----------|------------------------------------------------------------|
| `thresholdHours`  | number | yes*     | Trigger after N hours have passed since baseline (float, > 0). |

*Use this **or** `intervalDays`, not both.

**Example**: `{ "thresholdHours": 500 }` → trigger after 500 hours (~20.8 days) since the last maintenance was done.

**Validation**: DTO `TimeIntervalTriggerConfigDto` in `apps/api/src/resources/maintenances/dtos/time-interval-trigger-config.dto.ts`. Custom validator `ExactlyOneOf(['intervalDays', 'thresholdHours'])` enforces exactly one. Use create/update schedule DTOs with `triggerType: TIME_INTERVAL` and `timeIntervalConfig`.

---

## Validation in the API

- **DTOs** (class-validator): `UsageHoursTriggerConfigDto`, `UsageCountTriggerConfigDto`, `TimeIntervalTriggerConfigDto` in `apps/api/src/resources/maintenances/dtos/`.
- **Create/Update schedule**: `CreateMaintenanceScheduleDto` and `UpdateMaintenanceScheduleDto` use `@ValidateIf` + `@ValidateNested()` + `@Type()` so the correct config is required and validated for the given `triggerType`.
- **Custom validator**: `ExactlyOneOf` in `apps/api/src/resources/maintenances/validators/exactly-one-of.validator.ts` for TIME_INTERVAL (exactly one of `intervalDays` or `thresholdHours`).
- Schedule CRUD endpoints (work item 07) should use these DTOs in the controller and rely on Nest’s global `ValidationPipe` for validation.
