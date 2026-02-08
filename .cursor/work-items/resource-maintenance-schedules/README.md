# Resource Maintenance Schedules – Work Items

This folder contains **work items** for the feature: **Resource Maintenance Schedules**. The goal is to allow multiple maintenance schedules per resource (based on usage hours, usage count, or time intervals). When a condition triggers, the resource enters maintenance mode; only maintenance users can use it until the maintenance is marked as done. The system should document who did maintenance when.

**Base implementation**: The codebase already has manual maintenances (`ResourceMaintenance`, `ResourceMaintenanceService`, `ResourceMaintenanceController`, `hasActiveMaintenance`, `canManageMaintenance`). See `apps/api/src/resources/maintenances/maintenance.module.ts` and related files.

**Behavior — Maintenance mode and usage blocking:** When a resource has an active maintenance (manual or schedule-triggered), only users with maintenance permission can start a session; others get an error and see the maintenance-in-progress message. Active = `startTime <= now` and `endTime IS NULL`. See [MAINTENANCE_MODE_AND_USAGE_BLOCKING.md](./MAINTENANCE_MODE_AND_USAGE_BLOCKING.md) for details.

---

## Work item order and dependencies

| # | File | Summary | Depends on |
|---|------|---------|------------|
| 01 | `01-maintenance-schedules-data-model.md` | New `ResourceMaintenanceSchedule` entity; extend `ResourceMaintenance` with audit fields and optional `maintenanceScheduleId` | — |
| 02 | `02-schedule-trigger-types.md` | Trigger types (USAGE_HOURS, USAGE_COUNT, TIME_INTERVAL) and config DTOs (class-validator) | 01 |
| 03 | `03-schedule-evaluation-service.md` | Evaluate schedules (cron/event), create maintenance when triggered | 01, 02 |
| 05 | `05-mark-as-done-and-permissions.md` | Finish endpoint, permissions, set completedBy/completedAt | 01 |
| 06 | `06-audit-and-documentation-who-when.md` | Set createdBy on create; expose and show “who did maintenance when” in API and UI | 01, 05 |
| 07 | `07-frontend-maintenance-schedules-ui.md` | CRUD UI for maintenance schedules per resource | 01, 02 (API for schedules may be added in 01 or a small separate task) |
| 08 | `08-maintenance-mode-and-usage-blocking.md` | Verify and document that schedule-triggered maintenances block usage like manual ones | 01, 03 |

**Suggested execution order**: 01 → 02 → 03 and 05 in parallel if desired → 06, 07, 08. Item 08 can be done early (verification only) or last.

---

## Key code references (quick links)

- **Maintenance module**: `apps/api/src/resources/maintenances/maintenance.module.ts`
- **Maintenance entity**: `libs/database-entities/src/lib/entities/resource.maintenance.ts`
- **Resource entity**: `libs/database-entities/src/lib/entities/resource.entity.ts`
- **Usage blocking**: `apps/api/src/resources/usage/resourceUsage.service.ts` (~133–158), `hasActiveMaintenance`, `canManageMaintenance`
- **Flow nodes**: `libs/database-entities/src/lib/entities/resourceFlowNode.ts`, `apps/api/src/resources/flows/resource-flows-executor.service.ts`
- **Usage sessions / aggregates**: `libs/database-entities/src/lib/entities/resourceUsage.entity.ts`, `apps/api/src/projects/project-usage.service.ts`
- **Frontend maintenance UI**: `apps/frontend/src/app/resources/details/maintenance-management/`, `apps/frontend/src/app/resources/usage/components/ResourceUsageSession/`

---

## Notes for executing agents

- Each work item is **independent** enough to be implemented by a different agent; dependencies are listed above.
- **Implementation details** (exact class names, file paths, API shapes) are left to the executing agent; the markdown files give goals, context, code references, and acceptance criteria.
- After backend changes, regenerate the API client (OpenAPI codegen) so the frontend and tests stay in sync.
