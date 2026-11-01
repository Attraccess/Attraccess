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
- **End Session** – Complete usage
- **Take over session** – Take over another user's running session (if allowed)

Depending on configuration, you may need to fill in a [form](forms/overview.md) when starting, taking over or ending a session.

#### Machines with parallel sessions

If the machine allows more than one [parallel session](resources/creating-resources.md#max-parallel-sessions), or its limit was lowered while several sessions still run, the usage area shows:

- **Your own session** with an **End Session** button
- **Other active sessions** as a list with user, start time and supervisor (if any). Resource managers, introducers, maintainers and the supervisor of a session see an **End Session** button for each entry to end that person's session
- **In use k/N** while other people use the machine, with **Start controls** while slots are free and you do not have a session yet
- **Full (N/N)** when all slots are in use

Everybody starts and stops their own session. Stopping without picking an entry from the list ends your own session and never someone else's. Maintenance and health state only block new starts; running sessions continue and can be stopped normally. The view updates live without reloading.

> [!WARNING]
> On a machine with parallel sessions, flows run for every session start and stop, and meters and running time are charged to a single session only. See [Shared machines](resources/usage-tracking.md#shared-machines-parallel-sessions).

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
