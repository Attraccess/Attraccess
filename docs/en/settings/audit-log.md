# Audit log

<!-- llms-description: How to browse, filter, inspect and export the audit log of recorded activity and control recording and retention. -->

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

Select **View event** to open the detail drawer. It shows the actor, target, time, outcome, source, and operation ID. Where the event contains safe before/after snapshots, **What changed** compares the recorded values. Events may instead contain a decision, a result, or a compact summary. Plugin configuration summaries use the same comparison view.

Names marked **current** are looked up when you read the log; they may have changed since the event. Names marked **recorded** were saved with the event. Stable IDs remain visible in the details and export, including when the original user, resource, or other target has been deleted.

The details also show an API token ID, integration ID, IP address, and user agent when that information was recorded. A background or device operation may have no identified user or authentication method; missing context is not inferred from another event.

Audit records are historical and cannot be edited from the application. An event records the information available at that operation; it does not imply that every field of the underlying object was copied. A changed field without a recorded before or after value is shown as **Not recorded**.

Changes to the system default language use the existing `settings.updated` event in the administration domain. Its details identify `app.defaultLanguage` and record the previous and new canonical values (`de` or `en`). When recording is enabled for this domain, successful language changes appear under that event; a failed settings write does not record a successful change.

## Flow changes

Every change to a flow is recorded in the **resource** domain, with the acting user (or API token), the time and what changed:

| Event                                                                                    | Recorded when                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `resource_flow.updated` (Resource flow changed)                                          | A resource's flow canvas is saved with a change. Target: the resource.                                           |
| `flow.created`, `flow.updated`, `flow.deleted` (Global flow created / updated / deleted) | A global flow is created, its name, description or on/off switch changes, or it is deleted. Target type: `flow`. |
| `flow.canvas_updated` (Global flow canvas changed)                                       | A global flow's canvas is saved with a change. Target type: `flow`.                                              |
| `flow_variable.set`, `flow_variable.deleted` (Flow variable set / deleted)               | A user sets or deletes a flow variable on a resource's flow page. Target: the resource.                          |

Canvas events list the node and edge counts before and after, the added, removed and changed nodes (ID and type) and the added and removed connections. A node counts as changed when its type or settings change; moving a node only does not. A save that changes nothing, including one that only moves nodes, is not recorded. Saving an empty canvas over a filled one is always recorded.

The details also hold the previous canvas as JSON (**Previous flow**), so a flow that was lost can be rebuilt by hand from the entry or the CSV export. Details are limited to 4,096 bytes. For large flows the previous canvas is reduced step by step: first without node positions, then without node settings (only IDs, types and connections remain), and finally left out; the **Previous flow detail level** field shows which step applied (`full`, `no_positions`, `no_data`, `omitted`). Long lists of changed nodes are shortened, the counts stay complete.

Secrets are not stored: all HTTP header values and every setting whose name looks like a credential (for example password, token, secret, API key, authorization) are recorded as `[redacted]`. This is best effort; do not keep secrets in free-form node settings if you cannot rely on it.

Deleting a global flow records the flow and its nodes and connections as they were before deletion. Deleting a resource keeps its flow in the database, but the `resource.deleted` event notes how many flow nodes (`flowNodeCount`) and connections (`flowEdgeCount`) it had. Values that a running flow writes to flow variables are not recorded.

## Export

**Export CSV** downloads all retained events matching the applied filters, including pages you have not opened. It includes stable identifiers, event/outcome, timestamps, operation IDs, and recorded details. Changing a filter without applying it does not change the export. Spreadsheet formula-like text is escaped so it is treated as data.

## Control recording

On **Logging settings**:

- **Record audit activity** pauses or resumes future capture globally.
- Each **Activity domain** can be selected independently. Changing one domain preserves the others. Domains contributed by an installed plugin record while the plugin is installed and are switched off through the same list.
- **Retention period** accepts 1–3,650 days. Older records stop appearing in queries and are removed automatically.

Select **Save** to persist changes, or **Discard** to return to the saved settings. A failed save keeps the draft available for another attempt. Pausing capture does not erase retained history; actions performed while capture is paused are not reconstructed later.

The available domains follow the installed application version and integrations. Activity from an installed plugin appears under its own domain. The audit log records selected administrative and operational events, rather than raw device telemetry, complete credentials, or unfiltered request bodies.

## Related pages

- [Permissions](user-management/permissions.md)
- [Security and authentication log format](settings/security.md)
