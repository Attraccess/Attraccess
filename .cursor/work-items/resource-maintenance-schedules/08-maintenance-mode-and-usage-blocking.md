# Work Item 08: Maintenance Mode and Usage Blocking – Verification and Docs

---

## Progress notes (agent)

- **Backend verification (done):** `hasActiveMaintenance` in `maintenance.service.ts` only checks `resourceId`, `startTime <= now`, `endTime IS NULL` — no filter by origin. Schedule-created maintenances use the same table and are therefore included. All usage entry points call `getResource(..., { checkMaintenance: true })`: `startSession`, `lockDoor`, `unlockDoor`, `unlatchDoor`. No code path bypasses the maintenance check.
- **Frontend verification (done):** `ResourceUsageSession` uses `useResourceMaintenancesServiceFindMaintenances` with `includeActive: true`. When the list has any active maintenances, it renders `MaintenanceInProgressDisplay` instead of `StartSessionControls`. Only inside `MaintenanceInProgressDisplay`, users with `canManage` see `StartSessionControls`. Schedule-triggered maintenances are returned by the same API (`findMaintenances`), so they appear in the same list. The only way to start a session from the UI is via `StartSessionControls`, which calls the API; the API enforces the maintenance check. No UI bypass.
- **Documentation:** Added `MAINTENANCE_MODE_AND_USAGE_BLOCKING.md` in this folder and a short “Behavior” section in the work-items README. Code comments added above `hasActiveMaintenance` and in `getResource` (checkMaintenance block).
- **Tests:** Existing spec already has: “should throw ResourceUsageImpossibleMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance” and “should allow usage when resource is under maintenance but user can manage maintenance”. Added a test that explicitly documents that schedule-triggered maintenances (same `hasActiveMaintenance` result) block non–maintenance users the same as manual ones.
- **Edge cases:** Documented in `MAINTENANCE_MODE_AND_USAGE_BLOCKING.md`: concurrent “mark as done” returns 400 “Maintenance is already finished” for the second caller (idempotent 200 not implemented).

---

## Goal
Verify and document that when any maintenance is active (manual or schedule-triggered), only maintenance users can start a session (turn the resource on). No one else can use the resource until the maintenance is marked as done. Ensure behavior is consistent and that schedule-created maintenances are treated the same as manual ones.

## Context
- **Current behavior**: `ResourceUsageService.getResource(..., { checkMaintenance: true })` calls `ResourceMaintenanceService.hasActiveMaintenance(resourceId)`. If true, it then checks `canManageMaintenance(user, resourceId)`; if the user cannot manage maintenance, it throws `ResourceUsageImpossibleMaintenanceInProgressException` (`apps/api/src/resources/usage/resourceUsage.service.ts`, ~133–158).
- **Active maintenance**: Defined as a row in `resource_maintenance` with `resourceId`, `startTime <= now`, and `endTime IS NULL` (`maintenance.service.ts`, `hasActiveMaintenance`). Schedule-created maintenances use the same table, so they are already included.
- **Frontend**: `ResourceUsageSession` uses `useResourceMaintenancesServiceFindMaintenances` with `includeActive: true`; if there are active maintenances, it shows `MaintenanceInProgressDisplay` and only shows `StartSessionControls` when `canManage` is true (`apps/frontend/src/app/resources/usage/components/ResourceUsageSession/index.tsx`, `maintenance/index.tsx`).

## Tasks (for executing agent)

### 1. Verify backend blocking
- Confirm that `hasActiveMaintenance` does not filter by origin (manual vs schedule): it only checks `resourceId`, `startTime <= now`, `endTime IS NULL`. So any maintenance created by the schedule evaluator (work item 03) will already block non–maintenance users.
- Confirm that the only path to start a usage session goes through `getResource` with `checkMaintenance: true` (or an equivalent check). Grep for `startSession` / usage start and ensure maintenance is checked in all code paths that allow “turn on” or “start session”.
- If any path is found that bypasses maintenance check (e.g. another API or internal call), add the same check there or document the intentional exception.

### 2. Verify frontend behavior
- When `includeActive: true` and the list returns at least one active maintenance, the usage session component shows `MaintenanceInProgressDisplay` and hides the normal start controls for non–maintenance users; maintenance users still see `StartSessionControls`. Confirm this with the current code and that schedule-triggered maintenances appear in the same list (same API).
- Ensure no other UI path (e.g. direct deep link or different page) allows starting a session without going through this check. The real enforcement is on the API; the frontend is for UX.

### 3. Document behavior
- Add a short section to the maintenance module README or to the work-items folder describing:
  - “When a resource has an active maintenance (manual or schedule-triggered), only users with maintenance permission can start a session. All other users receive an error and see the maintenance-in-progress message.”
  - “Active maintenance is any `ResourceMaintenance` with `startTime <= now` and `endTime IS NULL`. Marking as done (setting `endTime` / finishing) restores normal access.”
- Optionally add a code comment above `hasActiveMaintenance` or `getResource(checkMaintenance)` stating that this is the single source of truth for “resource in maintenance mode”.

### 4. Tests (optional but recommended)
- In `resourceUsage.service.spec.ts`, ensure there is a test that when `hasActiveMaintenance` returns true and `canManageMaintenance` returns false, `startSession` throws `ResourceUsageImpossibleMaintenanceInProgressException`. (Such a test may already exist; see existing `hasActiveMaintenance` mocks in the spec.)
- Add a test that a maintenance created “by the system” (e.g. with `maintenanceScheduleId` set, no `createdByUserId`) still causes blocking for non–maintenance users (same as manual). This can be a unit test with a stored maintenance that has `maintenanceScheduleId` set.

### 5. Edge cases
- **Multiple schedules**: Only one active maintenance per resource at a time (evaluator creates only when none active). No change needed.
- **Concurrent finish**: If two maintenance users both click “mark as done”, the first wins; the second gets “already finished”. Document or handle idempotently (e.g. return 200 with current state).

## Code references
- Usage service: `apps/api/src/resources/usage/resourceUsage.service.ts` (`getResource`, `startSession`), `resourceUsage.service.spec.ts` (maintenance mocks)
- Maintenance service: `apps/api/src/resources/maintenances/maintenance.service.ts` (`hasActiveMaintenance`, `canManageMaintenance`)
- Exception: `apps/api/src/exceptions/resource.maintenance.inUse.exception.ts`
- Frontend: `apps/frontend/src/app/resources/usage/components/ResourceUsageSession/index.tsx`, `maintenance/index.tsx`

## Dependencies
- Work items 01–03 (schedule-created maintenances exist). This work item is mostly verification and documentation; it can be done after or in parallel with 03.

## Out of scope
- Changing who has maintenance permission (already defined by `canManageMaintenance`).
- New UI for “maintenance mode” beyond existing maintenance-in-progress message.

## Acceptance criteria
- [x] All code paths that allow starting a usage session enforce maintenance check; schedule-triggered maintenances block non–maintenance users the same as manual ones.
- [x] Behavior is documented in the repo; tests confirm blocking when maintenance is active and user cannot manage maintenance.
