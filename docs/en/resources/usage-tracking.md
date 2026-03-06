# Usage Tracking

Attraccess tracks who uses which resource and when. Every usage session is recorded and visible in the resource's usage history.

## What is a Usage Session?

A usage session represents a single period of resource use. It is created when a user starts using a resource and completed when they stop.

Each session contains:

| Field | Description |
|-------|-------------|
| **User** | Who used the resource |
| **Start Time** | When the session started |
| **End Time** | When the session ended |
| **Duration** | How long the resource was used |
| **Notes** | Optional notes about the session |
| **Project** | Optional associated project |

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

## Linking Sessions to Projects

If you have active [projects](projects/overview.md), you can link a usage session to a project. This helps track which resources are used for which projects.

The project association is set when starting the session.

## Usage History

The usage history is displayed on the resource [detail page](resources/resource-details.md) in chronological order. It shows all past and current sessions.

<!-- TODO: Screenshot of usage history -->

Resource managers and administrators can see sessions from all users. Regular users see the full history as well.

## See Also

- [Detail Page](resources/resource-details.md)
- [Introductions](resources/introductions.md)
- [CSV Export](resources/csv-export.md)
- [Projects](projects/overview.md)
- [Forms](forms/overview.md)
