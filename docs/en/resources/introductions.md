# Introductions

An introduction is a safety briefing that grants a user access to a resource. Before a user can start a usage session, they must be introduced to the resource (or to a group that contains the resource).

## How Introductions Work

Introductions follow a simple model:

- **Introducers** are trusted users who can grant or revoke access for others
- **Users** receive an introduction and can then use the resource

A user who has not been introduced cannot start a usage session on the resource.

Some resources can also allow or require **supervised usage**. In a supervised session, the user starts the session while a qualified **supervisor** is present. Only an introducer for the resource, including an applicable resource group introducer, may supervise. Supervision is useful for training, first attempts, or resources where policy requires a second person to be present.

## Roles

| Role | Can Do |
|------|--------|
| **User** | Use the resource after receiving an introduction |
| **Maintainer** | Use and control the resource, and manage its maintenance — but cannot grant introductions |
| **Introducer** | Everything a maintainer can do, plus grant and revoke introductions for other users |
| **Resource Manager** | All of the above, plus manage introducers/maintainers and resource settings |

For supervised sessions, the supervisor is an introducer who confirms the session and remains responsible for supervising it. A maintainer or resource manager can supervise only when they are also an introducer.

> [!NOTE]
> **Introducer vs Maintainer:** Both can operate the machine and put it into (or take it out of) maintenance. The difference is that only an **introducer** can grant introductions to other users. Use **maintainer** for people who service the machine but should not decide who else gets access.

## Granting an Introduction

You need the **Introducer** or **Resource Manager** role for the resource.

1. Open the [detail page](resources/resource-details.md) of the resource
2. Scroll to the **Introductions** section
3. Click **Add Introduction**
4. Search for and select the user
5. Optionally add a comment (e.g. "Completed safety training on 2025-01-15")
6. Confirm

<!-- TODO: Screenshot of granting an introduction -->

## Revoking an Introduction

1. Open the resource detail page
2. Scroll to the **Introductions** section
3. Find the user in the list
4. Click **Revoke**
5. Optionally add a comment explaining the reason
6. Confirm

> [!WARNING]
> Revoking an introduction immediately removes the user's ability to start new sessions on the resource. If the user currently has an active session, it will not be interrupted.

## Managing Introducers and Maintainers

Resource managers can promote users to the introducer or maintainer role:

1. Open the resource detail page
2. Scroll to the **People & Permissions** section
3. Click **Appoint as introducer** (full rights) or **Appoint as maintainer** (maintenance and machine control only)
4. Select the user

The role each person holds is shown in the **Role** column, and you can filter the list by introducers or maintainers. Revoking a role removes that person's permissions immediately.

## Group Introductions

Instead of introducing users to each resource individually, you can introduce them to a [resource group](resources/resource-groups.md). A group introduction grants access to **all resources** in that group.

This is useful when you have multiple similar resources, for example all 3D printers or all laser cutters.

> [!NOTE]
> If a user is introduced through a group, they will keep access to all resources in the group until the group introduction is revoked. Removing a resource from the group will also remove that user's access to the removed resource (if it was granted through the group only).

## Supervision Mode

Resource managers can choose how introductions and supervision interact for each resource:

| Mode | Meaning |
|------|---------|
| **Introduction required** | Only introduced users may start a session. This is the default behavior. |
| **Supervision allowed** | Introduced users may start alone. Users without an introduction may start a supervised session while a supervisor is present. |
| **Supervision required** | Every session requires a present supervisor, even for introduced users. |

On a machine with [parallel sessions](resources/creating-resources.md#max-parallel-sessions), a supervised session is one session (the supervisee's) with a linked supervisor. The supervisor does not use a slot, can supervise any number of sessions on the same machine, and can run their own session alongside. The supervisee must not already have a session on that machine, and a reader can be armed for supervision while at least one slot is free.

Supervised sessions are recorded in the usage history with the supervisor. This makes it visible who supervised the session and helps distinguish supervised training or trial usage from regular solo usage.

## Auto-promotion to Introduction

A resource can automatically grant an introduction after a user has completed enough supervised sessions. Resource managers configure:

- **Supervised sessions until introduction**: the number of completed supervised sessions required before the user is introduced automatically
- **Grant introduction for**: whether the automatic introduction applies to this resource or to a selected resource group

If the target is **this resource**, only supervised sessions on this resource count. If the target is **a resource group**, supervised sessions across resources in that group count toward the threshold, and the user receives a group introduction when the threshold is reached.

Auto-promotion can be disabled by leaving the threshold empty.

## Audit Trail

Every introduction change is logged with:

| Field | Description |
|-------|-------------|
| **Timestamp** | When the action occurred |
| **User** | Who performed the action |
| **Action** | Grant or revoke |
| **Comment** | Optional reason or note |

This audit trail is visible on the resource detail page and helps track who granted or revoked access and when.

## Who Can See the Lists

Reading access information requires signing in:

- The **full lists** (introductions, introducers, maintainers and history of a resource) are visible to users with **Update Resources** (`resources.update`) or **Manage Resource Access** (`resources.access.manage`), and to introducers of the resource or of one of its groups. This is the same rule as the **People** tab.
- **Introducer checks** (whether a user is an introducer) answer only about yourself. Users with **Update Resources** or **Manage Resource Access** can ask about anyone; everyone else gets `403`.
- **Names only:** everyone with **Read Resources** (`resources.read`) can see the usernames and roles (introducer or maintainer) of a resource's introducers, including those inherited from groups. People who are not introduced yet use this to find out who to ask. Email addresses are not included.

Who sees which resource is in use is a separate [system setting](settings/overview.md#resource-activity-visibility).

## See Also

- [Detail Page](resources/resource-details.md)
- [Resource Groups](resources/resource-groups.md)
- [Usage Tracking](resources/usage-tracking.md)
