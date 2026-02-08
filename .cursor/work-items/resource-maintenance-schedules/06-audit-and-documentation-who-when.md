# Work Item 06: Maintenance Audit and Documentation (Who Did Maintenance When)

<!-- Progress: DONE.
- 1) createMaintenance(resourceId, dto, userId?) in service; controller passes request.user?.id. createMaintenanceFromSchedule unchanged (no creator).
- 2) findMaintenances: leftJoinAndSelect createdByUser, completedByUser. getMaintenanceById: relations ['createdByUser','completedByUser'].
- 3) Frontend: table columns Created by, Completed by, Completed at; upsert modal shows audit block when existingMaintenance; i18n en/de (table.columns + audit in upsert).
- 4) Doc note in maintenance.module.ts.
- Optional list filters (createdByUserId, completedByUserId) not implemented per ticket.
- Regenerate API client if needed (entity already had audit fields in OpenAPI). -->

## Goal
Document who created and who completed each maintenance (and when), and expose this in APIs and UI so that “who did maintenance when” is visible for both manual and schedule-triggered maintenances.

## Context
- Work item 01 adds (or extends) `ResourceMaintenance` with `createdByUserId` / `performedByUserId`, `completedByUserId`, `completedAt`. Work item 05 sets `completedByUserId` and `completedAt` when marking as done.
- **Manual create**: When a user creates a maintenance via API, set `createdByUserId` (or `performedByUserId`) to the authenticated user in `ResourceMaintenanceService.createMaintenance`. Ensure the controller passes the user (e.g. from `AuthenticatedRequest`).
- **List/detail**: The maintenance list and detail endpoints return `ResourceMaintenance` entities; once the entity includes relations or IDs for `createdBy` and `completedBy`, the API response will expose them. Optionally load `user` relations (e.g. `createdByUser`, `completedByUser`) with minimal fields (id, username, etc.) for display.

## Tasks (for executing agent)

### 1. Set creator on create
- In `ResourceMaintenanceService.createMaintenance`, accept the current user (or userId) and set `createdByUserId` / `performedByUserId` on the new maintenance. For **system-created** (schedule evaluator), leave it null. Update controller to pass `request.user` into the service.
- Ensure DTOs and validation are unchanged; only the service and controller signatures need the user.

### 2. Expose audit fields in API responses
- Ensure `ResourceMaintenance` entity is serialized with `createdByUserId`, `completedByUserId`, `completedAt` (and optional `maintenanceScheduleId`). If the API uses Swagger/OpenAPI, the entity is already documented; add `@ApiProperty` for new fields if needed.
- **Optional**: Add relations `createdByUser` and `completedByUser` (or `User` snapshots) to the entity or to a response DTO so the frontend can show names without extra lookups. If you add relations, load them in `getMaintenanceById` and in the list endpoint (or allow optional `?include=createdByUser,completedByUser`). Prefer minimal payload (id, username or displayName).

### 3. List and filter (optional)
- If product wants “maintenances completed by user X” or “maintenances created by user X”, add optional query params to the list maintenances endpoint (e.g. `createdByUserId`, `completedByUserId`). Otherwise, no change to list filters.

### 4. Frontend display
- **Maintenance management table**: In `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`, add columns or tooltips for “Created by” and “Completed by” (and “Completed at” if not same as end time). Use the user display name or username from the API.
- **Maintenance detail / modal**: If there is an edit/detail modal (`ResourceMaintenanceUpsertModal` or similar in `maintenance-management/upsert/`), show audit info (created by, completed by, completed at) for completed maintenances.
- **Translations**: Add keys for “Created by”, “Completed by”, “Completed at” in the maintenance-management i18n files (`de.json`, `en.json`).

### 5. Documentation
- Short note in the maintenance module or API docs: “Manual maintenances record the creating user; completed maintenances record the user who marked them done and when. System-created (schedule-triggered) maintenances have no creator until completed by a user.”

## Code references
- Entity: `libs/database-entities/src/lib/entities/resource.maintenance.ts`
- Create: `apps/api/src/resources/maintenances/maintenance.service.ts` (`createMaintenance`), `maintenance.controller.ts` (create handler)
- List/detail: `maintenance.service.ts` (`findMaintenances`, `getMaintenanceById`), controller get/list
- Frontend table: `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`
- Upsert/detail modal: `apps/frontend/src/app/resources/details/maintenance-management/upsert/index.tsx`
- i18n: `apps/frontend/src/app/resources/details/maintenance-management/en.json`, `de.json`

## Dependencies
- Work item 01 (audit columns), work item 05 (setting completedBy/completedAt on finish).

## Out of scope
- Schedule CRUD or schedule-specific audit (work item 07).
- Changes to who can “use during maintenance” (already in place).

## Acceptance criteria
- Creating a maintenance from the API sets the creating user on the record.
- List and get maintenance responses include creator and completer (and completed at); frontend shows “Created by” and “Completed by” (and optionally “Completed at”) in the maintenance list/detail.
