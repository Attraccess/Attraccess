# Dashboard

<!-- llms-description: How to build your personal dashboard from widgets, page shortcuts and resources in three sizes, edit, resize and reorder it, and start or stop sessions from it. -->

Your dashboard collects what you use most in one place: widgets with live content, shortcuts to pages, and resources. Every user has their own dashboard, and it follows you to every browser and device you sign in on.

Open it with **Dashboard** at the top of the sidebar.

## Add something

There are two ways to put something on your dashboard.

**Add widget:** select **Edit dashboard** in the dashboard's header, then **Add widget**. A gallery opens with a live preview of every widget you may use, showing your real data:

- The entries are grouped: **Messages**, **Resources**, **Users**, **Billing**, **Attractap**, **Other pages**, and one group per plugin.
- Type in **Search widgets** to filter by name, description, group or related terms. Groups without a match are hidden.
- Where an entry comes in more than one size, choose it under **Size** (**Small**, **Medium** or **Large**). The preview changes with it.
- Select **Add** to place the entry at the end of your dashboard in the chosen size. The gallery stays open, so you can add several at once.
- Entries that are already on your dashboard stay in the gallery and show **Added**.

Pages appear in the gallery as small shortcut tiles, in the group of their sidebar section. To pin a single resource, use the **Resource** entry in the **Resources** group: pick the resource under **Choose resource**, then select **Add**. Resources that are already on your dashboard cannot be picked again.

**The star:** open a page or a resource and select the **star** in its header (**Pin to dashboard**). The star fills in.

You can add:

- the [widgets](#widgets) you may use
- every page in the sidebar that you are allowed to open, except the dashboard itself and links that leave Attraccess
- pages of plugins whose plugin offers them for the dashboard
- any resource you can see

An empty dashboard offers **Add widget** and **Browse resources** right away.

## Your start page

As long as your dashboard is empty, Attraccess still opens on the resource overview. Once something is on it, opening Attraccess shows your dashboard instead. Remove everything to go back to the resource overview.

## Widget sizes

Every tile has one of three sizes:

- **Small:** one grid cell
- **Medium:** two cells wide, one cell high
- **Large:** two cells wide and two cells high

The grid has 2, 4 or 6 columns, depending on how much space there is next to the sidebar. In the 2-column layout, medium and large tiles take the full width. All rows have the same height, and small tiles move up to fill gaps, so the dashboard has no empty holes. Each widget shows as much as fits its size; a larger tile shows more entries.

To change a tile's size, select **Edit dashboard**, then the size button of the tile (**Change size of …**) and choose a size. Only the sizes the tile supports are offered. The new size shows and is saved right away. If it cannot be saved, the tile returns to its saved size and you get a message.

## Edit mode

Normally the dashboard is a clean view: you can use everything on the tiles, and a widget's title opens its page. There are no handles or remove buttons. To change the dashboard, select **Edit dashboard**. While you edit:

- every tile shows a handle to move it, a size button if it comes in more than one size, and a remove button (**Remove … from dashboard**)
- widget titles do not open their page
- **Add widget** opens the gallery
- every change is saved immediately

Select **Done** to return to the normal view. Leaving the dashboard also ends edit mode.

### Reorder the tiles

In edit mode, drag a tile by its handle (the dotted grip at its top left) to a new place. With a keyboard, focus the handle, press Space, move the tile with the arrow keys and press Space again. The new order is saved immediately. If it cannot be saved, the dashboard returns to the saved order and tells you.

The keyboard order always follows your order. Because small tiles fill gaps, a tile can appear slightly earlier on screen than its place in that order.

### Remove a tile

In edit mode, select the remove button in a tile's top right corner. For pages and resources, you can also select the filled star in their header again.

## Tiles on the dashboard

- **Page shortcuts** are small tiles with the page's icon and name, plus a counter where the sidebar shows one (for example unread messages). Select the tile to open the page.
- **Resource tiles** come in two sizes. Small shows the resource's name, its status and, while your own session runs, its elapsed time; select it to open the resource. Large shows the status and the session controls: you can start and stop your own session right there, under the same rules as on the resource page. You need an introduction, supervised starts ask for a supervisor, and so on. A running session of someone else shows its timer.
- **Widgets** show live content and quick actions for an area of Attraccess. Select a widget's title to open its page.

The tiles update live while sessions start and end.

## Widgets

Each widget is offered only to users who may open the page it stands for. Each button inside a widget appears only if you may use what it opens. The default size is shown in bold.

| Widget              | Shows                                                                                                                                                                                                             | Sizes                    | Who sees it                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| **Messages**        | Small: your unread count and who wrote last. Medium and large: your 3 or 7 latest conversations with a preview and their unread counts. Select a conversation to open it.                                         | Small, **Medium**, Large | Everyone                                                         |
| **My sessions**     | Your running sessions with their elapsed time and **Stop**, which ends a session after a confirmation. Small shows one session, medium up to 3, large up to 7; small and large count the rest.                    | Small, **Medium**, Large | Everyone                                                         |
| **Find a resource** | A search that lists matching resources with their status as you type (3 in medium, 7 in large). Press Enter to open the resource overview with your search term. **Create resource** if you may create resources. | **Medium**, Large        | Everyone                                                         |
| **In use now**      | Which resources are in use right now. Small shows how many; medium and large list 3 or 7 with their timer and, where you may see it, who uses them. Updates live.                                                 | Small, **Medium**, Large | Everyone who may open the resource overview                      |
| **Users**           | A search that lists matching users as you type (3 in medium, 7 in large), **Invite user** if you may invite, and a link to users with unverified email addresses when there are any.                              | **Medium**, Large        | Users who may see the user list                                  |
| **Balance**         | Your credit balance in the configured currency, in red when it is negative. Medium also shows your last 3 transactions.                                                                                           | **Small**, Medium        | Instances with the billing module                                |
| **Reader health**   | How many of your paired readers have not connected for 24 hours, green when none. Medium also lists up to 3 of them, each opening its diagnostics.                                                                | **Small**, Medium        | Users who manage readers, on instances with the Attractap module |

Plugins can add their own widgets, in a gallery group of their own. For example, the Reservations plugin offers **Upcoming reservations** (small, **medium**, large): your next booking with its start time, or your next 3 or 7 bookings, and **Manage** for people who manage reservations.

## Tiles you can no longer use

When you lose access to a pinned page or widget, for example because a permission was removed, a license module ended or a plugin is no longer available, its tile says **No longer accessible**. Select **Remove from dashboard** to remove it; this button is there even outside edit mode. If you keep it and get access back, the normal tile returns.

When a pinned resource is deleted, its tile disappears from every dashboard.
