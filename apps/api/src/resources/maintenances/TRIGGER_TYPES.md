# Maintenance Schedule Trigger Types

This document describes the trigger types and their configuration for `ResourceMaintenanceSchedule`. Validation is done via **NestJS DTOs and class-validator** in the API. Use this for the evaluation service (work item 03) and frontend UI.

**Baseline**: For all trigger types, the baseline is always **when the last maintenance created by this schedule was marked done** (that maintenance’s `completedAt` or `endTime`). If no such maintenance exists yet, the baseline is the schedule’s creation or another agreed reference (e.g. resource creation).

---

## 1. USAGE_HOURS

Trigger after **N duration (in given unit) of resource usage** since the baseline.

| Field       | Type   | Required | Description                                                       |
|-------------|--------|----------|-------------------------------------------------------------------|
| `duration`  | number | yes      | Duration value (int, > 0).                                        |
| `unit`      | enum   | yes      | Unit for duration: `MINUTES`, `HOURS`, or `DAYS`.                 |

**Examples**:
- `{ "duration": 100, "unit": "HOURS" }` → trigger after 100 hours of usage.
- `{ "duration": 30, "unit": "DAYS" }` → trigger after 30 days of usage (30 × 24 × 60 minutes).
- `{ "duration": 90, "unit": "MINUTES" }` → trigger after 90 minutes of usage.

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

Time-based trigger. Uses **duration + unit** (same pattern as USAGE_HOURS).
Trigger after N duration (in unit) has passed since baseline (wall-clock).
Baseline = when last maintenance for this schedule was done.

| Field       | Type   | Required | Description                                                       |
|-------------|--------|----------|-------------------------------------------------------------------|
| `duration`  | number | yes      | Duration value (int, > 0).                                        |
| `unit`      | enum   | yes      | Unit for duration: `MINUTES`, `HOURS`, or `DAYS` (same as USAGE_HOURS). |

**Examples**:
- `{ "duration": 500, "unit": "HOURS" }` → trigger after 500 hours (~20.8 days) since the last maintenance was done.
- `{ "duration": 90, "unit": "MINUTES" }` → trigger after 90 minutes since baseline.
- `{ "duration": 30, "unit": "DAYS" }` → trigger after 30 days since baseline.

**Validation**: DTO `TimeIntervalTriggerConfigDto` in `apps/api/src/resources/maintenances/dtos/time-interval-trigger-config.dto.ts`. Use create/update schedule DTOs with `triggerType: TIME_INTERVAL` and `timeIntervalConfig`.

---

## Validation in the API

- **DTOs** (class-validator): `UsageHoursTriggerConfigDto`, `UsageCountTriggerConfigDto`, `TimeIntervalTriggerConfigDto` in `apps/api/src/resources/maintenances/dtos/`.
- **Create/Update schedule**: `CreateMaintenanceScheduleDto` and `UpdateMaintenanceScheduleDto` use `@ValidateIf` + `@ValidateNested()` + `@Type()` so the correct config is required and validated for the given `triggerType`.
- Schedule CRUD endpoints (work item 07) should use these DTOs in the controller and rely on Nest’s global `ValidationPipe` for validation.
