# Usage Tracking
<!-- llms-description: How usage sessions are started, ended, shared between users, linked to projects and reviewed in the usage history. -->

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

A machine can allow several people to use it at the same time via **Max parallel sessions** (see [Creating Resources](resources/creating-resources.md#max-parallel-sessions)). Each person has their own session; a person can have only one active session per machine. Starting is refused with **Session already active** if you already have a session, or with **Machine is full** when as many people as allowed are already using it. A supervised session counts as one session (the supervisee's); the [supervisor](resources/introductions.md#supervision-mode) does not count towards the limit.

Everybody ends their own session. Resource managers, introducers, maintainers and the supervisor of a session can end a chosen session of someone else by picking it from the list of active sessions on the [detail page](resources/resource-details.md) and clicking **End Session**.

> [!WARNING]
> **Flows on shared machines (limit above 1).** [Flows](flows/overview.md) run for every session start and stop. A flow that switches the power off when a session ends therefore cuts the power for everybody on the machine unless it checks `activeSessions` (see [Active sessions on shared machines](flows/payloads-variables-templates.md#active-sessions-on-shared-machines)). The resource settings list the flows that do not check it in the **Resource type and behavior** section. With a limit of 1, this does not apply.

### Billing on shared machines

Everybody is billed for their own session, and every person's charges are on their own billing transaction and count toward their own [project](#linking-sessions-to-projects).

- **Per-use fee and session time** stay per person and are never split. Session time is the person's own session duration, rounded up to whole minutes.
- **Meters (for example energy) and running time** are shared fairly. Every start and stop of a session on the machine closes the current time segment and opens a new one. Each segment records its time range, the consumption measured between its two boundary readings, the operating time of the machine inside it and which sessions were active. Consumption and operating time of a segment are split equally among the sessions active in that segment, so the total charged never exceeds what the machine actually consumed or ran.
- A session that never shared a segment with another session is billed exactly as on a single-user machine (running time rounded up to whole minutes). As soon as a session shared any segment, its running time is charged on exact shares, because rounding up per person would create credit out of nothing.
- Each meter has an **Allocation** setting that can switch a meter to **Measured per session** instead. See [Meters on shared machines](flows/energy-metering.md#meters-on-shared-machines) for the details, rounding, failed readings and meters that cannot be split.

For example, a machine uses 8 kWh at 30 credits per kWh. Person A is alone for 2 kWh, A and B are together for 2 kWh and B is alone for 4 kWh. A pays 2 + 1 = 3 kWh = 90 credits, B pays 1 + 4 = 5 kWh = 150 credits.

On receipts, in the billing history and in the live session billing view, a shared session shows the person's share (for example "0.8 kWh - your share of 2.4 kWh") with a **shared** marker and a breakdown of every segment the person was in. See [Billing transactions](billing/transactions.md#shared-sessions).

With a limit of 1, nothing changes. If a limit is lowered while sessions are running, overlapping sessions are still split fairly. If it is raised during a solo session, that session joins the segments from the moment others start.

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
