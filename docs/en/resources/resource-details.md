# Detail Page

The resource detail page shows all information and management functions in one place.

## Layout

<!-- TODO: Add screenshot of detail page -->

### Header Area

- **Resource image** and **name**
- **Description** of the resource
- **Action bar** (for authorized users):
  - View/edit documentation
  - Generate QR code
  - Manage flows
  - Manage forms
  - Edit/delete resource

### Usage Session

If you are introduced to the resource, you can:

- **Start session** – Begin using the resource
- **End session** – Complete usage
- **Take over session** – Take over another user's running session (if allowed)

Depending on configuration, you may need to fill in a [form](forms/overview.md) when starting, taking over or ending a session.

### Usage History

Chronological list of all usage sessions showing:
- User
- Start and end time
- Duration
- Notes
- Associated project

### Additional Sections (for Authorized Users)

| Section | Permission | Description |
|---------|-----------|-------------|
| **Introductions** | Introducer or resource manager | Manage [introductions](resources/introductions.md) |
| **Introducers** | Resource manager | Grant introducer rights |
| **Maintenance** | Resource manager | Manage [maintenance](resources/maintenance.md) |
| **Maintenance Schedules** | Resource manager | Automatic maintenance triggers |
| **Groups** | Resource manager | [Group membership](resources/resource-groups.md) |

## See Also

- [Creating Resources](resources/creating-resources.md)
- [Introductions](resources/introductions.md)
- [Flows](flows/overview.md)
- [Forms](forms/overview.md)
