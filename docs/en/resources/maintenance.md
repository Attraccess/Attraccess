# Maintenance

Attraccess helps you keep track of maintenance for your resources. You can create manual maintenance records and set up automated maintenance schedules that trigger based on usage or time.

## Permissions

You need the **Manage Resources** permission to create and manage maintenance records and schedules.

## Manual Maintenance

Manual maintenance records track individual maintenance tasks performed on a resource.

### Creating a Maintenance Record

1. Open the [detail page](resources/resource-details.md) of the resource
2. Scroll to the **Maintenance** section
3. Click **New Maintenance**
4. Fill in the details:

| Field | Required | Description |
|-------|----------|-------------|
| **Reason** | Yes | What maintenance is being performed |
| **Start Time** | Yes | When maintenance begins |

5. Click **Save**

<!-- TODO: Screenshot of creating a maintenance record -->

### Completing a Maintenance Record

1. Open the resource detail page
2. Find the open maintenance record in the **Maintenance** section
3. Click **Complete**
4. The end time and completing user are recorded automatically

### Maintenance Record Details

Each maintenance record contains:

| Field | Description |
|-------|-------------|
| **Start Time** | When maintenance started |
| **End Time** | When maintenance was completed |
| **Reason** | Description of the maintenance work |
| **Created By** | User who created the record |
| **Completed By** | User who marked it as complete |

## Automated Maintenance Schedules

Maintenance schedules automatically create maintenance reminders based on usage or time. This helps ensure resources are maintained regularly.

### Creating a Schedule

1. Open the resource detail page
2. Scroll to the **Maintenance Schedules** section
3. Click **New Schedule**
4. Select a trigger type and configure it

<!-- TODO: Screenshot of creating a maintenance schedule -->

### Trigger Types

| Trigger Type | Description | Example |
|-------------|-------------|---------|
| **USAGE_HOURS** | Triggers after the resource has been used for a specified number of hours | Maintenance every 100 hours of usage |
| **USAGE_COUNT** | Triggers after a specified number of usage sessions | Maintenance every 500 sessions |
| **TIME_INTERVAL** | Triggers after a specified amount of wall clock time (days, hours, or minutes) | Maintenance every 30 days |

### Schedule Settings

| Setting | Description |
|---------|-------------|
| **Trigger Type** | One of USAGE_HOURS, USAGE_COUNT, or TIME_INTERVAL |
| **Trigger Value** | The threshold that triggers maintenance (e.g. 100 hours, 500 sessions, 30 days) |
| **Enabled** | Whether the schedule is currently active |

> [!NOTE]
> Disabling a schedule does not delete it. You can re-enable it at any time. The schedule will resume tracking from where it left off.

### How Automated Schedules Work

1. The schedule monitors the configured trigger (usage hours, session count, or elapsed time)
2. When the threshold is reached, a maintenance reminder is created
3. A resource manager completes the maintenance and marks the record as done
4. The counter resets and the schedule begins tracking toward the next threshold

> [!TIP]
> You can combine multiple schedules on the same resource. For example, set one schedule for every 100 usage hours and another for every 6 months, whichever comes first.

## See Also

- [Detail Page](resources/resource-details.md)
- [Usage Tracking](resources/usage-tracking.md)
- [Resources Overview](resources/overview.md)
