# Usage Tracking

Attraccess tracks who uses which resource and when. Every usage session is recorded in the resource's usage history.

Who can see whether a resource is in use, and by whom, depends on the [resource activity visibility](settings/overview.md#resource-activity-visibility) setting. You always see your own sessions.

## What is a Usage Session?

A usage session represents a single period of resource use. It is created when a user starts using a resource and completed when they stop.

Each session contains:

| Field          | Description                      |
| -------------- | -------------------------------- |
| **User**       | Who used the resource            |
| **Start Time** | When the session started         |
| **End Time**   | When the session ended           |
| **Duration**   | How long the resource was used   |
| **Notes**      | Optional notes about the session |
| **Project**    | Optional associated project      |

## Starting a Session

1. Open the [detail page](resources/resource-details.md) of the resource
2. Click **Start Session**
3. Depending on the resource configuration, you may need to fill in a [form](forms/overview.md)

> [!NOTE]
> You must be [introduced](resources/introductions.md) to the resource (or to a group containing it) before you can start a session.

<!-- TODO: Screenshot of starting a session -->

## Ending a Session

1. Open the resource detail page
2. Click **End Session**
3. Depending on the resource configuration, you may need to fill in a form

## Shared Machines (Parallel Sessions)

A machine can allow several people to use it at the same time via **Max parallel sessions** (see [Creating Resources](resources/creating-resources.md#max-parallel-sessions)). Each person has their own session; a person can have only one active session per machine. Starting is refused with **Session already active** if you already have a session, or with **Machine is full** when all slots are used. A supervised session counts as one session (the supervisee's); the [supervisor](resources/introductions.md#supervision-mode) does not use a slot.

Everybody ends their own session. Resource managers, introducers and the supervisor of a session can end a chosen session of someone else by picking it from the list of active sessions on the [detail page](resources/resource-details.md) and clicking **End session**.

> [!WARNING]
> **Interim behavior of flows and billing on shared machines (limit above 1).** Flows and billing are not yet aware of the number of running sessions. With a limit of 1, nothing changes.
>
> - **Flows** run for every session start and stop as before. A flow that switches the power off when a session ends therefore cuts the power for everybody on the machine. Flow awareness of the session count is planned.
> - **Per-use fees** are charged per session.
> - **Session-time billing** is charged per session as before.
> - **Meters (for example energy):** the earliest-started session that is still running owns the meter and is charged its consumption. Later overlapping sessions are not metered or charged for meters already in use. When that session ends while others continue, the meter is read as usual and the remaining sessions are not charged any further meter consumption.
> - **Running (operating) time** is attributed to exactly one session at any moment, the earliest-started active one, so the total charged never exceeds the machine's operating time.
>
> A fair split of meters and running time between simultaneous sessions is planned.

## Linking Sessions to Projects

If you have active [projects](projects/overview.md), you can link a usage session to a project. This helps track which resources are used for which projects.

The project association is set when starting the session.

## Usage History

The usage history is displayed on the resource [detail page](resources/resource-details.md) in chronological order. It shows all past and current sessions.

<!-- TODO: Screenshot of usage history -->

People with **Update Resources** (`resources.update`) or **Manage Resource Access** (`resources.access.manage`), and people introduced to the resource (directly or through a group, including its introducers and maintainers), see the sessions of all users. Everyone else sees only their own sessions, plus any project-linked session of a [project](projects/overview.md) they are a member of.

With **Only people introduced to the resource** selected, people who are not introduced but could use a supervised-use resource see **Available** or **In Use** there instead: the unfiltered history lists the other sessions redacted, with times only and no names or details. Filtering the history by another user is not possible for them.

## See Also

- [Detail Page](resources/resource-details.md)
- [Introductions](resources/introductions.md)
- [CSV Export](resources/csv-export.md)
- [Projects](projects/overview.md)
- [Forms](forms/overview.md)
