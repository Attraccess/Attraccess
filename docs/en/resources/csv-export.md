# CSV Export

<!-- llms-description: Export resource usage, resource hours and billing data as CSV: permissions, choosing columns, templates, available fields and file format. -->

Export resource usage, resource hours and billing data as a CSV file for analysis, reporting, accounting, or upload into other systems. You decide which columns the file contains, what their headers are called, and in which order they appear. Saved **templates** make the same setup reusable.

## Permissions

| Export                     | Required permission                       |
| -------------------------- | ----------------------------------------- |
| **Resource usage**         | `resources.reports.export`                |
| **Resource hours summary** | `resources.reports.export`                |
| **Billing transactions**   | `billing.manage` (and the billing module) |

The **CSV Export** page is available if you have at least one of these permissions. The landing page only shows the export types you may use. Loading the billing data additionally requires `resources.update`; without it the billing configuration page shows that the data could not be loaded.

## Exporting Data

1. Open the **CSV Export** page from the sidebar navigation.
2. Pick a date range with a preset (e.g. _Last 30 days_) or choose a custom range.
3. Click the card of the export type you want. This opens the configuration page of that export (`/csv-export/resource-usage-hours`, `/csv-export/resource-hours-summary` or `/csv-export/billing-transactions`).
4. Choose a template or configure the columns (see below). The preview shows the first rows exactly as they will appear in the file.
5. Click **Download CSV**. The file is downloaded to your computer once all data is loaded.

The date range is part of the page address (`?start=…&end=…`), so reloading the page or sharing the link keeps it. If the range in the address is missing or invalid, the last 30 days are used. The back arrow next to the page title returns to the range selection.

<!-- TODO: Screenshot of CSV export configuration page -->

## Configuring Columns

Without a template the export starts with the default columns of its type. Below the template section you can change them:

- **Field column**: pick any available data field. Use **Add field column**.
- **Constant column**: writes the same fixed value on every row, e.g. a cost center or an organization ID required by the target system. Use **Add constant column**. A constant may be empty.
- **Header**: each column has its own header. If you leave it empty, the default label of the field is used (shown as placeholder).
- **Order**: use the arrow buttons to move a column up or down. The file contains the columns in exactly this order.
- **Remove**: removes the column from the export.

The download is disabled while there are no columns, no rows, or while data is loading.

### Group by User and Resource (resource usage)

The checkbox is kept as before. The grouping itself is not implemented yet and currently has no effect on the file.

## Templates

A template stores the complete column setup (fields, constants, custom headers, order) under a name. Templates belong to one export type and are **shared with everyone** who may use the CSV export. Template names are unique per export type.

- **Select** a template to load its columns into the editor. **No template (default columns)** restores the defaults.
- **Save as new template** asks for a name and stores the current setup.
- **Save changes** overwrites the selected template with the current setup. The name can be edited before saving.
- **Delete template** removes the template for everyone after you confirm.

You can keep editing after loading a template without saving. The download always uses what you currently see in the editor. If a template with that name already exists, an error is shown and nothing is saved.

> [!NOTE]
> If a template contains a field that is missing from the current data (for example a resource metadata key that no resource in the selected range has), the column is still exported with its header and empty values. The editor marks it as _Not available in current data_ and keeps it in the template.

## Available Fields

### Resource usage

| Field                            | Description                                                                |
| -------------------------------- | -------------------------------------------------------------------------- |
| Resource ID / Resource Name      | The resource that was used                                                 |
| User ID / User Name              | The user of the session                                                    |
| **User Email**                   | Email address of the user                                                  |
| **User External ID**             | The external identifier of the user (e.g. from your SSO provider)          |
| Start Time / End Time            | Formatted for your locale (also available as ISO timestamps)               |
| Usage in Minutes / Hours         | Length of the session                                                      |
| Exact Session Duration (ms)      | Session length in milliseconds                                             |
| Operating Duration (ms, session) | Operating time attributed to the session (if operating data is available)  |
| Operating Data Status            | Whether the operating duration is final, provisional, or unavailable       |
| Start Notes / End Notes          | Notes entered at the start and end of the session                          |
| Supervisor ID / Supervisor Name  | The supervising user, if any                                               |
| **Supervisor Email**             | Email address of the supervising user                                      |
| **Resource metadata: \<key\>**   | One field for every metadata key found on the resources in the loaded rows |

### Resource hours summary

One row per resource: every resource with at least one usage session or one recorded operating interval that overlaps the selected range, including resources deleted since. Use it to compare **person hours** with **machine hours** (see [Machine hours and person hours](resources/usage-tracking.md#machine-hours-and-person-hours)).

| Field                             | Description                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource ID / Resource Name       | The resource                                                                                                                                                                                 |
| Sessions                          | Number of usage sessions that overlap the range                                                                                                                                              |
| Person Hours                      | The durations of all sessions added up. Sessions that run at the same time count each                                                                                                        |
| Machine Hours with a Session      | Time in which at least one session was running. Overlapping sessions count once                                                                                                              |
| Machine Running Time (Hours)      | Time the machine was recorded as running, with or without a session. Empty if the resource has no operating data                                                                             |
| Running Outside a Session (Hours) | Part of the running time without any session (not selected by default). Empty if the resource has no operating data                                                                          |
| Operating Data Status             | _Provisional_ if the range has not ended yet, so the values can still change. _Unavailable_ without operating data. Both, separated by `;`, when both apply; empty when the values are final |
| **Resource metadata: \<key\>**    | One field for every metadata key found on the resources in the loaded rows                                                                                                                   |

The hours are decimal numbers formatted for your locale. The export is limited to `resources.reports.export`; without it the request is refused.

> [!IMPORTANT]
> **The two resource exports treat the date range differently, so their totals are not directly comparable.**
>
> - **Resource usage** contains the sessions that **start** within the range, each with its **full** duration, even if it ends after the range.
> - **Resource hours summary** **clips** every session and operating interval to the range (and to the current time for ranges that end in the future). A session that started before the range counts only from the start of the range.
>
> A session that spans the end of the range is therefore counted completely in the usage export, but only partly in the summary. The usage export always contains person time; one row per session, parallel sessions are not merged.

### Billing transactions

| Field                                                   | Description                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| ID, Created at, Amount, Status, External reference      | The transaction                                                       |
| User, **User ID**, **User Email**, **User External ID** | The user who was charged                                              |
| Initiator, **Initiator Email**                          | The user who initiated the transaction                                |
| Resource / Usage                                        | Name of the resource of the related usage                             |
| Refund of / Correction of                               | Related transaction IDs                                               |
| Items                                                   | Invoice items                                                         |
| **Resource metadata: \<key\>**                          | One field for every metadata key of the resource of the related usage |

Resource metadata values are written as text. Objects and lists are written as JSON.

> [!NOTE]
> Regular user endpoints never include email addresses; only the CSV export data contains them. In the billing export the email fields stay empty unless you have `billing.manage` or `resources.reports.export`.

## CSV File Format

- Columns are separated by a semicolon (`;`), lines by a line feed. The separator is not configurable.
- Cells and headers containing a semicolon, a double quote, or a line break are enclosed in double quotes. Double quotes inside a cell are doubled (`"` becomes `""`), as spreadsheet applications expect.
- Missing values are written as empty cells.
- Values are written unchanged, including values that start with `=`, `+`, `-` or `@`, so target systems receive the original data.

> [!WARNING]
> Some fields contain text entered by users (for example session notes, user names or resource metadata). A spreadsheet application may interpret such a value as a formula. Only open exports in a spreadsheet application you trust, and do not enable external content or macros for them.

> [!TIP]
> You can open the CSV file in spreadsheet applications like Microsoft Excel, Google Sheets, or LibreOffice Calc for further analysis.

## See Also

- [Usage Tracking](resources/usage-tracking.md)
- [Resources Overview](resources/overview.md)
