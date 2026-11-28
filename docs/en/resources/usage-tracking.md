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

## Automatic Stop and Extending a Session

If the resource has a [max session time or requires a duration estimate](resources/creating-resources.md#max-session-time-and-duration-estimate), the session has an automatic end.

- **Estimate dialog:** when the resource requires an estimate, starting a session (also takeover, QR link and supervised start) first opens a dialog. Enter how long you will use the machine at most, in hours and minutes or with a quick pick. The dialog shows the max session time, if there is one, and does not accept more. The machine will stop automatically after this time at the latest.
- **Countdown and extending:** while the session runs, the resource page shows **Stops automatically at HH:MM** with a live countdown. Use **+1 h**, **+2 h**, **+4 h**, **+6 h**, **+12 h**, **+24 h** or **Extend to maximum** to extend. Buttons that would pass the max session time are disabled; when nothing is left, the page says that the maximum is reached. The session owner and everybody who may end that session see the controls. Other people's sessions show the stop time read-only.
- **Warnings:** the session owner gets a **Resource session ending soon** notification 15 and 5 minutes before the end (in the app, as push and by email, according to their notification preferences). A warning whose time had already passed when the session started is skipped, and an extension arms the warnings for the new end.
- **Automatic stop:** at the end time the server ends the session as the system, with the note "Automatically ended: maximum session time reached" or "Automatically ended: estimated duration elapsed". End forms are skipped, [flows](flows/overview.md) run their stop branch (so power is cut, even in the middle of a job such as a 3D print; see the warning in [Creating Resources](resources/creating-resources.md#max-session-time-and-duration-estimate)), and billing works as for any other end. The owner is notified. It can take up to about a minute after the deadline.
- **Parallel sessions and takeover:** each person's session has its own deadline; one automatic end does not end the others. A takeover gives the new person a fresh deadline, and they must give an estimate if one is required.
- **Audit log:** the audit log records **Usage extended** and the end reason of automatic stops.

Changing the resource settings does not change the deadline of running sessions. See [Attractap readers](attractap/using-the-reader.md#session-duration-and-extending) for readers.

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

On receipts and in the billing history, a shared session shows the person's share against the total (for example "0.8 — your share of 2.4") with a **Shared** marker and a breakdown of every segment the person was in. See [Billing transactions](billing/transactions.md#shared-sessions). While the session runs, the live session billing view shows the meter share so far (for example "0.8 — your share of 1.2 so far"), marked "provisional until the next reading", and the same breakdown with the open segment marked provisional; it shows no **Shared** marker.

With a limit of 1, nothing changes. If a limit is lowered while sessions are running, overlapping sessions are still split fairly. If it is raised during a solo session, that session joins the segments from the moment others start.

### Machine hours and person hours

Reports show these figures separately, so that people using a shared machine at the same time are not counted as extra machine time:

- **Person hours**: the duration of every session added up. If A uses the machine from 10:00 to 12:00 and B from 11:00 to 13:00, this is 4 hours.
- **Machine hours with a session**: the time in which at least one session was running on the machine. Overlapping sessions count once, so the example gives 3 hours.
- **Machine running time**: the time the machine was recorded as running (see [Flows](flows/node-types.md)), where operating data exists. It also includes time without a session.

On a machine with **Max parallel sessions** of 1, person hours and machine hours with a session are equal. The project statistics call machine hours with a session simply **Machine hours**.

You find the figures in the **Operating duration** card on the resource [detail page](resources/resource-details.md), on the statistics of a [project](projects/overview.md#usage-statistics), and in the [Resource hours summary export](resources/csv-export.md#resource-hours-summary). This only changes what is reported: how running time is attributed to individual sessions, and billing, stay as described above.

## Linking Sessions to Projects

If you have active [projects](projects/overview.md), you can link a usage session to a project. This helps track which resources are used for which projects.

The project association is set when starting the session. After a session has ended, its owner can move it to another of their projects in the usage history.

### Switching the project of a running session

While your machine session is running, you can move it to another project without stopping the machine:

1. Open the resource detail page
2. In the running session, click **Change project**
3. Pick another of your projects, or **No project**, and click **Change project**
4. Fill in any [forms](forms/overview.md) required for a project switch

Everything up to the switch is booked to the old project, everything after it to the new one: minutes, machine running time, [metered consumption](flows/energy-metering.md), credits and the [project statistics](projects/overview.md#usage-statistics). The elapsed time shown for your session still counts from its original start.

- **One record per project.** A switch ends the current usage record and starts a **continuation** at the same instant. The history shows them as consecutive rows; each later row is marked **Continues after a project change**. Every row has its own duration and charge. The [CSV export](resources/csv-export.md) contains the ID of the previous part (`previousUsageId`).
- **The machine keeps running.** A switch does not run the **Usage Started**, **Usage Stopped** or **Usage Takeover** [flows](flows/node-types.md#resource-usage-project-switched), asks for no start, end or takeover forms and sends no start, stop or takeover notifications. To react to a switch, use the **Project switched** flow trigger and the **Project switch** form action. No end note is asked.
- **Charging** follows the resource's [Charging on project switch](billing/configuration.md#charging-on-project-switch) setting. The previous part is billed at the switch.
- **Meters** are read at the switch. If a billed meter cannot be read, or a project switch flow fails, the whole switch is refused: the session keeps running under the old project.
- **Carried over:** the prices and billing factor saved at the start, the supervisor, the [automatic stop](#automatic-stop-and-extending-a-session) and its extensions, and on a shared machine your slot (a full machine does not block a switch).
- **Ending and extending while a switch runs:** an **End Usage Session** node of another flow run (for example an emergency stop or an idle shutdown) is not lost. It waits for the switch, then ends the session: under the new project, or under the old one if the switch is refused. You can extend the session meanwhile, and the new stop time stays after the switch.
- **Who can switch:** only the person whose session it is. Administrators and resource managers cannot switch somebody else's running session; they can still change ended parts as before. Doors have no sessions to switch.
- If your installation [restricts actions to the local network](settings/security.md), switching follows the rule for starting a session on the web and in the API.
- A session counts once for the **number of uses** maintenance schedule, for supervised-use promotion and in the session counts of the resource hours report. Project statistics count each part for its project.

You can also switch on a [Touch reader](attractap/using-the-reader.md#change-the-project-of-a-running-session), or through the REST API with `POST /api/resources/{resourceId}/usage/sessions/active/project` and the body `{ "projectId": 12 }` (`null` for no project; `usageId` optionally names the running session, so a session that ended meanwhile is not mistaken for its successor).

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
