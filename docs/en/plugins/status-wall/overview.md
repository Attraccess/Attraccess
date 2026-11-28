# Status Wall

<!-- llms-description: The Status Wall plugin shows on a big screen which machines are ready, in use or under maintenance, live and without signing in. -->

> [!NOTE]
> Only available when the **Status Wall** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

A status wall is a full-screen page for a big screen in a workshop or factory hall. Every machine is a tile with its
picture, framed in a traffic-light colour, so people see from across the room what is free:

| Colour | Icon   | Meaning                                       |
| ------ | ------ | --------------------------------------------- |
| Green  | Tick   | Ready: nobody is using it.                    |
| Amber  | Power  | In use, with how long the session has run.    |
| Red    | Wrench | Under maintenance, with how long it has been. |

The header shows the wall's name, the number of machines in each state and the time. The tiles always fit the screen,
whether the wall shows 4 or 60 machines, and they keep their places (sorted by name).

## Prerequisites

- Attraccess 2.0 or newer and the `status-wall` plugin, installed as described in
  [Installing Plugins](plugins/installing-plugins.md). It needs `PLUGIN_STORAGE` (its own table), `ACCESS_RESOURCES`
  (machine states) and `LISTEN_EVENTS` (live updates).
- To set up walls, the **Manage status walls** permission (`status-wall.walls.manage`). Administrators and resource
  managers have it by default.

## Set up a wall

1. Open **Status walls** in the sidebar and choose **New status wall**.
2. Enter a name and choose what the wall shows: **all resources**, or some resource groups and resources. A group
   shows every machine that is in it at the moment.
   You can only select resources and groups you may see yourself (see
   [Who can see the machine list](settings/overview.md#machine-list-visibility)), and you can save **all resources**
   only when your own machine list is not narrowed. A selected group shows all its machines, including ones you may not
   see yourself, and **all resources** also shows machines that are only in hidden resource groups.

   Saving checks the whole selection, including what was saved earlier or by someone else. If a wall holds a resource
   or a group with machines that you may no longer see, you cannot save it, not even to rename it, until you remove that
   entry. The dialog does not list it: for resources, choose **Clear selection** and select them again; for groups,
   choose **Remove them from the selection**. This changes what the wall shows. To keep it as it is, ask someone who
   may see everything on it to edit the wall. Deleted resources and groups do not block saving.
3. Save. The dialog shows the wall's link. Open it on the screen, or copy it to the screen's browser.

You can set up as many walls as you like, for example one per hall. The **⋮** menu of a wall opens it, shows its link
again, edits it, issues a new link or deletes it.

On the screen, double-click the wall to switch to full screen. The page keeps the display awake where the browser
allows it.

## The link

The link contains a long random secret and needs no account, so a screen never has to sign in. Anyone who has the link
can see the wall. A wall shows only machine names, pictures and states: never who uses a machine or why it is under
maintenance.

- **New link** replaces the secret. Screens with the old link show "This link is no longer valid" and need the new one.
- **Delete** removes the wall; its link stops working at once.
- Links are limited to 120 requests per minute per screen and wall, which is far more than a screen needs.

## How it stays up to date

The screen receives a message from the server as soon as a session starts, is taken over or ends, or maintenance is
created or finished, and reloads the wall within about a second. It also reloads every minute, which picks up new
names and pictures, machines added to a group and maintenance that starts at a planned time. When the server cannot be
reached, the wall keeps showing the last state with a "no connection" icon in the header.
