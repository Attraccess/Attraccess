# Work Item 05: Mark Maintenance as Done and Permissions

## Goal
Ensure that only users with maintenance permission can mark a maintenance as done, and that the “mark as done” path is exposed and consistent for both manual and schedule-triggered maintenances. Optionally expose a dedicated “finish” endpoint and set audit fields.

## Context
- **Existing**: `ResourceMaintenanceService.finishMaintenance(maintenanceId)` sets `endTime = new Date()` and emits `ResourceMaintenanceChangedEvent` (`apps/api/src/resources/maintenances/maintenance.service.ts`). There is **no** `finishMaintenance` endpoint in `ResourceMaintenanceController` (`apps/api/src/resources/maintenances/maintenance.controller.ts`); the controller has create, update, delete (cancel), get, list. So “mark as done” today is done via **update** (PUT with `endTime`).
- **Permission**: `CanManageMaintenanceGuard` and `ResourceMaintenanceService.canManageMaintenance(user, resourceId)` – used for create, update, cancel. Same permission should gate “mark as done” (see ticket: “no one except maintenance users should be able to turn them on until the maintenance schedule was marked as done (by user with permission)”).
- **Usage**: When in maintenance, only users with `canManageMaintenance` can start a session (`resourceUsage.service.ts` ~133–158). So “mark as done” and “use during maintenance” are already aligned on the same permission.

## Tasks (for executing agent)

### 1. Decide “mark as done” API shape
- **Option A**: Add `POST resources/:resourceId/maintenances/:maintenanceId/finish` (or `PATCH .../finish`) that calls `finishMaintenance(maintenanceId)`. Request body can be optional (e.g. `{ notes?: string }` for completion notes). This gives a clear semantic and allows setting `completedByUserId` and `completedAt` in one place.
- **Option B**: Keep using `PUT resources/:resourceId/maintenances/:maintenanceId` with `endTime: now`. Ensure in that case that when the client sets `endTime`, the server sets `completedByUserId` and `completedAt` (work item 01/06 audit fields).
- Prefer **Option A** for clarity and a single place to set audit fields; implement Option A unless the team prefers B.

### 2. Implement finish endpoint (if Option A)
- **Controller**: In `ResourceMaintenanceController`, add a route for finish (e.g. `Post(':maintenanceId/finish')` or `Patch(':maintenanceId/finish')`). Use `@CanManageMaintenance()` so only maintenance users can call it. Validate that `maintenanceId` belongs to `resourceId` and that the maintenance is not already finished (`endTime` is null).
- **Service**: In `finishMaintenance`, set `completedByUserId` and `completedAt` from the authenticated user and current time (from work item 01/06). Optionally accept completion notes and persist them (if you add a `completionNotes` or reuse `reason` for “reason for completion”).
- **DTO**: Optional body DTO for finish, e.g. `FinishMaintenanceDto { notes?: string }`.

### 3. Permissions
- Ensure the new finish endpoint is protected with `CanManageMaintenance()` (same as update/cancel). No new permission model is required; reuse `canManageMaintenance`.
- If using Option B (update with endTime), ensure update is already guarded and that setting `endTime` updates `completedByUserId` and `completedAt` when the maintenance was active (startTime <= now, endTime was null).

### 4. Frontend (minimal)
- If there is a “Finish” or “Mark as done” button in the maintenance list/detail, wire it to the new finish endpoint (or to update with endTime). Reference: `apps/frontend/src/app/resources/details/maintenance-management/` (table with edit/cancel). Add a “Mark as done” action for active maintenances that calls the new API and invalidates the maintenances list query.

### 5. Regenerate API client
- After adding the endpoint, regenerate the API client (e.g. OpenAPI codegen used by `libs/api-client` and `libs/react-query-client`) so the frontend can call the new operation.

## Code references
- Controller: `apps/api/src/resources/maintenances/maintenance.controller.ts`
- Service: `apps/api/src/resources/maintenances/maintenance.service.ts` (`finishMaintenance`, `updateMaintenance`)
- Guard: `apps/api/src/resources/maintenances/canManageMaintenance.guard.ts`, decorator `canManageMaintenance.decorator.ts`
- Frontend maintenance table: `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`
- Usage permission check: `apps/api/src/resources/usage/resourceUsage.service.ts` (getResource with checkMaintenance and canManageMaintenance)

## Dependencies
- Work item 01 (audit fields `completedByUserId`, `completedAt` on ResourceMaintenance). Work item 06 can extend with more audit display.

## Out of scope
- Full audit history UI (work item 06).
- Schedule CRUD API (work item 07).

## Acceptance criteria
- Only users with `canManageMaintenance` can mark a maintenance as done (via new finish endpoint or via update).
- When a maintenance is marked done, `endTime`, `completedByUserId`, and `completedAt` are set; event is emitted.
- Frontend can trigger “mark as done” for active maintenances; API client is up to date.
