# Dashboard

<!-- llms-description: How to build your personal dashboard from widgets, pages and resources, edit and reorder it, and start or stop sessions from it. -->

Your dashboard collects what you use most in one place: widgets with live content, pages and resources. Every user has their own dashboard, and it follows you to every browser and device you sign in on.

Open it with **Dashboard** at the top of the sidebar.

## Add something

There are two ways to put something on your dashboard.

**Add to dashboard:** select **Edit dashboard** in the dashboard's header, then **Add to dashboard**. The list shows every widget and page you may use that is not on your dashboard yet. Select **Add** next to an entry to place it at the end of your dashboard. The list stays open, so you can add several at once. Select **Close** when you are done.

**The star:** open a page or a resource and select the **star** in its header (**Pin to dashboard**). The star fills in. Resources can only be added this way.

You can add:

- the [widgets](#widgets) you may use
- every page in the sidebar that you are allowed to open, except the dashboard itself and links that leave Attraccess
- pages of plugins whose plugin offers them for the dashboard
- any resource, from its detail page

An empty dashboard offers **Add to dashboard** and **Browse resources** right away.

## Your start page

As long as your dashboard is empty, Attraccess still opens on the resource overview. Once something is on it, opening Attraccess shows your dashboard instead. Remove everything to go back to the resource overview.

## Edit mode

Normally the dashboard is a clean view: you can use everything on the cards, but there are no handles or remove buttons. To change the dashboard, select **Edit dashboard**. While you edit:

- every card shows a handle to move it and a remove button (**Remove … from dashboard**)
- **Add to dashboard** opens the list of widgets and pages
- every change is saved immediately

Select **Done** to return to the normal view. Leaving the dashboard also ends edit mode.

### Reorder the cards

In edit mode, drag a card by its handle (the dotted grip at its top left) to a new place. With a keyboard, focus the handle, press Space, move the card with the arrow keys and press Space again. The new order is saved immediately. If it cannot be saved, the dashboard returns to the saved order and tells you.

### Remove a card

In edit mode, select the remove button in a card's top right corner. For pages and resources, you can also select the filled star in their header again.

## Cards on the dashboard

- **Page cards** show the page's icon and name, plus a counter where the sidebar shows one (for example unread messages). Select the page name to open the page.
- **Resource cards** show the resource's status and its session controls. You can start and stop your own session right there, under the same rules as on the resource page: you need an introduction, supervised starts ask for a supervisor, and so on. A running session of someone else shows its timer. Select **Open** to go to the resource page.
- **Widgets** show live content and quick actions for an area of Attraccess.

The cards update live while sessions start and end.

## Widgets

Each widget is offered only to users who may open the page it stands for. Each button inside a widget appears only if you may use what it opens.

| Widget          | Shows                                                                                                                                                                | Who sees it                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Messages**    | The number of unread messages, your five latest conversations with a preview and their unread counts, and **Open inbox**. Select a conversation to open it.          | Everyone                                                         |
| **My sessions** | Your running sessions with a timer each, and **Stop** to end one after a confirmation.                                                                               | Everyone                                                         |
| **Resources**   | A search that opens the resource overview with your search term, and buttons for all resources, creating a resource, flows, MQTT servers, readers and usage reports. | Everyone; each button only with its permission                   |
| **Users**       | A search that opens the user list with your search term, and buttons for all users, unverified email addresses, inviting a user and roles.                           | Users who may see the user list                                  |
| **Balance**     | Your credit balance in the configured currency, with **Top up** and **Transactions**.                                                                                | Instances with the billing module                                |
| **Readers**     | How many readers are paired and how many have not connected for 24 hours, the three of those that went quiet most recently, and **All readers**.                     | Users who manage readers, on instances with the Attractap module |

Plugins can add their own widgets. For example, the Reservations plugin offers **Upcoming reservations**: your next three bookings, **My reservations** and, for people who manage reservations, **Manage**.

## Cards you can no longer use

When you lose access to a pinned page or widget, for example because a permission was removed, a license module ended or a plugin is no longer available, its card says **No longer accessible**. Select **Remove from dashboard** to remove it; this button is there even outside edit mode. If you keep it and get access back, the normal card returns.

When a pinned resource is deleted, its card disappears from every dashboard.
