# Creating Resources

You need the **Manage Resources** permission to create new resources.

## Creating a New Resource

1. Navigate to the resource overview (home page)
2. Click the **+** button
3. Fill in the form:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Resource name (e.g. "Laser Cutter Trotec") |
| **Type** | Yes | Machine or Door |
| **Description** | No | Detailed description |
| **Image** | No | Photo of the resource (JPG, PNG) |
| **Allow Takeover** | No | Next user can take over session without the previous user ending it. Only takes effect when **Max parallel sessions** is 1 |
| **Max parallel sessions** | No | Machines only: how many people may use the machine at the same time (1–1000, default 1). Doors ignore this setting |

4. Click **Save**

<!-- TODO: Add screenshot of creation form -->

### Max Parallel Sessions

By default, a machine can be used by one person at a time. If a machine can safely be used by several people simultaneously (for example a workbench or a shared tool station), raise **Max parallel sessions** in the resource settings under **Resource type and behavior** (with **Machine** selected), next to **Allow Takeover**.

- With the limit at **1** (the default), only one person can use the machine at a time.
- With a limit of **N**, up to N different people can each have their own active session at the same time. Each person can only have one active session per machine.
- When as many people as allowed are using the machine, further starts are refused with the message **Machine is full**.
- **Allow Takeover** only applies when the limit is 1. On a machine with a higher limit, takeover is not offered.
- Introduction, permission, [supervision mode](resources/introductions.md), forms, balance, maintenance and health state are checked for each person individually.

You can lower the limit at any time. Running sessions are never ended automatically; new starts are blocked until fewer sessions than the limit are active. If the new limit is below the number of currently active sessions, the settings page shows a hint. Raising the limit above 1 also shows a warning about flows.

> [!WARNING]
> [Flows](flows/overview.md) and billing do not take the number of running sessions into account. Flows run for every session start and stop, so a flow that switches power off when a session ends cuts the power for everybody on the machine. Meters and running time are charged to a single session only. Read [Shared machines](resources/usage-tracking.md#shared-machines-parallel-sessions) before enabling parallel sessions on a machine with power control or metered billing.

## Editing a Resource

1. Open the resource [detail page](resources/resource-details.md)
2. Click **Edit**
3. Change the desired fields
4. Save the changes

## Deleting a Resource

1. Open the resource detail page
2. Click **Delete**
3. Confirm the deletion

> [!WARNING]
> Deleting a resource also removes all associated introductions, usage history and flows. This action cannot be undone.

## See Also

- [Detail Page](resources/resource-details.md)
- [Adding Documentation](resources/documentation.md)
- [Managing Introductions](resources/introductions.md)
