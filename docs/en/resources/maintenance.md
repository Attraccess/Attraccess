# Maintenance
<!-- llms-description: Track resource maintenance with manual records and automated maintenance schedules, including the required permissions. -->

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

## Maintenance requests

> [!NOTE]
> Maintenance requests need the **maintenance** license module.

Anyone who notices a problem can ask for maintenance. A request notifies the people who can manage the resource's maintenance, who then turn it into a maintenance or dismiss it. People who can manage the maintenance themselves are not offered to file one.

- **In the web app:** open the resource's detail page, click **Report a problem**, describe what is wrong (at least 3 characters) and send the request.
- **On an Attractap Touch reader:** sign in with your card, open the resource and tap [Report a problem](attractap/using-the-reader.md#report-a-problem).

### “Is the machine OK?” when a session ends

Before you end **your own** session, Attraccess asks **Is the machine OK?**:

- **Machine is OK** ends the session as usual.
- **Needs maintenance** asks **What's wrong?** (at least 3 characters). After **Continue**, the session ends and your maintenance request is filed.
- **Cancel** keeps the session running.

The question comes before any end-of-use forms (and after the notes, if you chose **End with notes**). The request is filed only once the session has ended: if you cancel a form, or ending fails, nothing is sent. If the session ends but the request cannot be sent, you get a warning; use **Report a problem** instead.

The web app asks when you end your session with the session controls of a resource (on its detail page, or on a pinned resource on the dashboard). Attractap Touch readers ask when you stop your session. It is not asked when you end or take over someone else's session, and not by the active-sessions banner, the **My sessions** dashboard widget, kiosk sign-out, automatic session ends or flows. The check is part of the user interface only: API clients and readers with older firmware end sessions without it. Attractap Lite readers have no screen and never ask.

The question is **on by default** for every resource. To turn it off for one resource, open **Edit** → **Machine** and switch off **Ask 'Machine OK?' when a session ends**. The switch is shown only with the maintenance license module.

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
| **Duration Basis** | For duration schedules: session duration or machine operating duration |
| **Enabled** | Whether the schedule is currently active |

Session duration counts usage sessions. Operating duration counts recorded machine operation, including time without an active user session. Existing schedules keep session duration; session history is never converted into operating history.

Both bases include live elapsed time from open intervals. Only time after the last maintenance completion counts toward the next cycle: a session or operating interval that crosses that timestamp is split at the timestamp, without rounding. Before the first completion, the baseline is the resource's creation time. The periodic evaluation runs every five minutes, so detecting a crossed threshold can lag by that interval.

> [!NOTE]
> Disabling a schedule pauses reminders, not duration accumulation. Re-enabling it includes time since the unchanged maintenance baseline.

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
