# Audit log

Open **Settings → Audit log** to inspect recorded activity. The **Activity** tab shows the newest events first; **Logging settings** controls future capture and retention.

## Access

Reading and exporting events requires `system.audit.read`. Changing logging settings requires `system.settings.manage`. API tokens need the corresponding permission in their own permission set as well as the owner's permissions. A user who can read the audit log can inspect activity without being allowed to change its settings.

## Find an event

1. Choose a domain and, if useful, an event prefix such as `maintenance_schedule`.
2. Set **From** and **To** to narrow the time range. Dates are entered in your local time zone.
3. Open **More filters** for an actor ID, target ID/type, or outcome.
4. Select **Apply filters**. On small screens, open **Filters** first; applying them brings the activity list back into view.

Use **Older** and **Newer** to move through the result. **Refresh** returns to the newest matching events. **Clear filters** removes all active constraints. An empty result means no retained events match the current filters; a loading failure is shown separately with a retry action.

## Inspect changes

Select **View event** to open the detail drawer. It shows the actor, target, time, outcome, source, and operation ID. Where the event contains safe before/after snapshots, **What changed** compares the recorded values. Events may instead contain a decision, a result, or a compact summary. WAGO configuration summaries use the same comparison view.

Names marked **current** are looked up when you read the log; they may have changed since the event. Names marked **recorded** were saved with the event. Stable IDs remain visible in the details and export, including when the original user, resource, or other target has been deleted.

The details also show an API token ID, integration ID, IP address, and user agent when that information was recorded. A background or device operation may have no identified user or authentication method; missing context is not inferred from another event.

Audit records are historical and cannot be edited from the application. An event records the information available at that operation; it does not imply that every field of the underlying object was copied. A changed field without a recorded before or after value is shown as **Not recorded**.

## Export

**Export CSV** downloads all retained events matching the applied filters, including pages you have not opened. It includes stable identifiers, event/outcome, timestamps, operation IDs, and recorded details. Changing a filter without applying it does not change the export. Spreadsheet formula-like text is escaped so it is treated as data.

## Control recording

On **Logging settings**:

- **Record audit activity** pauses or resumes future capture globally.
- Each **Activity domain** can be selected independently. Changing one domain preserves the others.
- **Retention period** accepts 1–3,650 days. Older records stop appearing in queries and are removed automatically.

Select **Save** to persist changes, or **Discard** to return to the saved settings. A failed save keeps the draft available for another attempt. Pausing capture does not erase retained history; actions performed while capture is paused are not reconstructed later.

The available domains follow the installed application version and integrations. WAGO controller activity appears under its own domain. The audit log records selected administrative and operational events, rather than raw device telemetry, complete credentials, or unfiltered request bodies.

## Related pages

- [Permissions](user-management/permissions.md)
- [Security and authentication log format](settings/security.md)
