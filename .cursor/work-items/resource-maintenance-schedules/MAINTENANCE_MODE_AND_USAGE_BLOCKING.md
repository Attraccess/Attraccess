# Maintenance mode and usage blocking

When a resource has an **active maintenance** (manual or schedule-triggered), only users with maintenance permission can start a usage session (e.g. turn the resource on). All other users receive an error from the API and see the maintenance-in-progress message in the UI.

## Active maintenance

**Active maintenance** is any `ResourceMaintenance` row with:

- `resourceId` matching the resource
- `startTime <= now`
- `endTime IS NULL`

There is no distinction by origin: maintenances created manually and those created by the schedule evaluator (work item 03) are treated the same. Marking a maintenance as done (setting `endTime` / finishing it) restores normal access for everyone.

## Enforcement

- **Backend:** The single place that allows starting a usage session (or lock/unlock door, etc.) is `ResourceUsageService.getResource(..., { checkMaintenance: true })`. That path calls `ResourceMaintenanceService.hasActiveMaintenance(resourceId)` and, if true, then `canManageMaintenance(user, resourceId)`. If the user cannot manage maintenance, the service throws `ResourceUsageImpossibleMaintenanceInProgressException`. So schedule-triggered maintenances block non–maintenance users the same as manual ones.
- **Frontend:** The usage session UI uses `findMaintenances` with `includeActive: true`. When there is at least one active maintenance, it shows the maintenance-in-progress state and only shows start-session controls to users who `canManage` maintenance. The real enforcement is on the API; the frontend is for UX.

## Edge cases

- **Multiple schedules:** Only one active maintenance per resource at a time; the evaluator creates a new maintenance only when none is active. No change needed.
- **Concurrent “mark as done”:** If two maintenance users both click “mark as done”, the first request succeeds. The second receives HTTP 400 with “Maintenance is already finished”. Idempotent 200-with-current-state is not implemented.
