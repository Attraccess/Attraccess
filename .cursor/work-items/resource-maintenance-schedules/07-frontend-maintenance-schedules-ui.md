# Work Item 07: Frontend – Maintenance Schedules UI

## Goal
Provide a UI for configuring multiple maintenance schedules per resource: list, create, edit, delete, enable/disable. Users should see which schedules exist and how they are triggered (usage hours, usage count, or time interval), and optionally which maintenance record was created by which schedule.

## Context
- **Backend**: Work items 01–03 provide the data model and APIs for `ResourceMaintenanceSchedule` and trigger types. This work item assumes there is an API for CRUD on schedules (e.g. `GET/POST/PUT/DELETE resources/:resourceId/maintenance-schedules` and `GET/PUT .../maintenance-schedules/:scheduleId`). If not yet implemented, the frontend can be built against a contract (OpenAPI) and the API added in a separate small task.
- **Existing maintenance UI**: Resource details include a “Maintenance” card that lists manual (and now schedule-triggered) maintenances: `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`. Tables and modals use HeroUI, `useResourceMaintenancesServiceFindMaintenances`, and similar patterns.
- **Resource details layout**: Schedules could be a new card/section on the same resource details page, or a subsection inside the maintenance card (e.g. “Schedules” tab or “Configure schedules” link). Decide with product; recommend a dedicated “Maintenance schedules” card or section.

## Tasks (for executing agent)

### 1. API client and hooks
- Ensure the generated API client and React Query hooks include maintenance schedule endpoints (e.g. list, get, create, update, delete). If the backend API is added in this or a previous work item, run the OpenAPI codegen so that `libs/react-query-client` (or equivalent) exposes e.g. `useResourceMaintenanceSchedulesServiceFindSchedules`, create, update, delete mutations.
- Add any missing query keys and invalidation when schedules or maintenances change (e.g. invalidate schedule list when a maintenance is created/finished if the UI shows “last triggered”).

### 2. Schedules list UI
- **Location**: e.g. `apps/frontend/src/app/resources/details/maintenance-schedules/` (new folder) or under `maintenance-management/`.
- **Content**: Table (or list) of schedules for the resource: name/label, trigger type (translated), trigger config summary (e.g. “Every 100 usage hours”, “Every 30 days”, “After 500 hours”), enabled (toggle), actions (edit, delete). Use same design system as `maintenance-management` (HeroUI Table, buttons, icons).
- **Empty state**: When there are no schedules, show an empty state and a CTA to add the first schedule.

### 3. Create / Edit schedule modal (or page)
- Form fields:
  - Name (optional).
  - Trigger type: select (USAGE_HOURS, USAGE_COUNT, TIME_INTERVAL).
  - Trigger config: dynamic form based on trigger type (e.g. threshold minutes for USAGE_HOURS; for TIME_INTERVAL either intervalDays or thresholdHours). Use the same config shapes as defined in work item 02. Baseline is always “last maintenance done for this schedule”.
  - Enabled: checkbox (default true).
- Validation: align with backend validation (required fields, min/max for numbers). Submit via create or update mutation and invalidate the schedule list.

### 4. Delete and enable/disable
- Delete: confirm dialog then delete mutation; invalidate list.
- Enable/disable: toggle that calls update with `enabled: true/false`; invalidate list.

### 5. Link to maintenances (optional)
- In the maintenances table, if a maintenance was created by a schedule, show the schedule name or “Auto: &lt;schedule name&gt;” in the reason or a new column. This may require the list maintenances API to return `maintenanceScheduleId` and optionally schedule name; backend can be extended in this or work item 06.

### 6. Permissions
- Reuse the same permission as for maintenances: only show schedules section (and create/edit/delete) when the user has `canManageMaintenance` for the resource. Use existing `useResourceMaintenancesServiceCanManageMaintenance` (or equivalent for the resource) to hide/disable actions.

### 7. i18n
- Add translations for schedule trigger types, config labels, and any new strings in `maintenance-schedules` (or existing maintenance) `en.json` / `de.json`.

## Code references
- Maintenance management UI: `apps/frontend/src/app/resources/details/maintenance-management/index.tsx`, `upsert/index.tsx`, `cancel/`
- Resource details page: `apps/frontend/src/app/resources/details/resourceDetails.tsx` (or similar) where cards are composed
- React Query hooks: `libs/react-query-client/src/lib/queries/queries.ts` (pattern for maintenances)
- HeroUI components: same as in maintenance-management

## Dependencies
- Backend CRUD API for maintenance schedules (can be implemented in parallel or in 01/02). Work items 01, 02 for data shape and trigger types.

## Out of scope
- Backend schedule CRUD API (if not yet present; add in a small separate task or extend work item 01/02).
- Evaluation logic (work item 03).

## Acceptance criteria
- User can list, create, edit, delete, and enable/disable maintenance schedules for a resource from the UI.
- Trigger type and config are correctly represented and validated.
- Only users with maintenance permission can change schedules; i18n is in place.
