# Introductions

An introduction is a safety briefing that grants a user access to a resource. Before a user can start a usage session, they must be introduced to the resource (or to a group that contains the resource).

## How Introductions Work

Introductions follow a simple model:

- **Introducers** are trusted users who can grant or revoke access for others
- **Users** receive an introduction and can then use the resource

A user who has not been introduced cannot start a usage session on the resource.

## Roles

| Role | Can Do |
|------|--------|
| **User** | Use the resource after receiving an introduction |
| **Introducer** | Grant and revoke introductions for other users |
| **Resource Manager** | All of the above, plus manage introducers and resource settings |

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

## Managing Introducers

Resource managers can promote users to the introducer role:

1. Open the resource detail page
2. Scroll to the **Introducers** section
3. Click **Add Introducer**
4. Select the user

## Group Introductions

Instead of introducing users to each resource individually, you can introduce them to a [resource group](resources/resource-groups.md). A group introduction grants access to **all resources** in that group.

This is useful when you have multiple similar resources, for example all 3D printers or all laser cutters.

> [!NOTE]
> If a user is introduced through a group, they will keep access to all resources in the group until the group introduction is revoked. Removing a resource from the group will also remove that user's access to the removed resource (if it was granted through the group only).

## Audit Trail

Every introduction change is logged with:

| Field | Description |
|-------|-------------|
| **Timestamp** | When the action occurred |
| **User** | Who performed the action |
| **Action** | Grant or revoke |
| **Comment** | Optional reason or note |

This audit trail is visible on the resource detail page and helps track who granted or revoked access and when.

## See Also

- [Detail Page](resources/resource-details.md)
- [Resource Groups](resources/resource-groups.md)
- [Usage Tracking](resources/usage-tracking.md)
