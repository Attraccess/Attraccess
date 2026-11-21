# Using Reservations
<!-- llms-description: How members book resources, check in, handle approvals and use calendar feeds with the Reservations plugin. -->

> [!NOTE]
> Only available when the **Reservations** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

## Booking a resource

1. Open the resource's [detail page](resources/resource-details.md). On resources with reservations enabled you see a
   **Reservations** card with a day and a week view. Your own bookings are highlighted; other people's bookings
   appear as **Reserved**.
2. Click **Reserve**.
3. Choose the date, the start time and the duration. Start and duration follow the resource's time step (for
   example 15 minutes), and only valid slots can be selected. The dialog also shows the check-in rules and whether
   a manager has to approve the booking.
4. Confirm. The booking is **confirmed** right away, or **pending** if the resource requires approval.

All times are shown in the plugin's configured [timezone](plugins/reservations/administration.md#timezone).

Booking never grants permission to start the resource. You can only start a resource if you are allowed to use it
anyway (for example because you have an introduction).

Who may book depends on the resource:

| Setting         | Who may book                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `can-start`     | Everyone who may start the resource (including users who may start it under supervision), introducers, maintainers and users with **Manage Resources**. |
| `managers-only` | Introducers, maintainers and users with **Manage Resources**.                                                                                           |
| `any-user`      | Every signed-in user.                                                                                                                                   |

A booking is refused (with a reason) if it overlaps another booking including its buffers, overlaps a
[maintenance](resources/maintenance.md) window, lies outside the bookable hours, is too short, too long, too far
ahead, too late or in the past, or if you already have the maximum number of active bookings on that resource.

#### Machines with several parallel sessions

On a machine with `maxParallelSessions` of N > 1, a booking takes **one slot**, not the whole machine. Limit-1 machines
and doors work as described above.

- Up to N bookings (pending and confirmed, buffers included) may overlap. The (N+1)-th overlapping booking is refused
  with "All slots are booked at this time" (code `OVERLAP`).
- You cannot hold two overlapping bookings on the same machine (code `OWN_OVERLAP`).
- While a booking is running, its slot counts against spontaneous starts. A start is refused with the "Reserved" text
  only when the running sessions plus the slots reserved for **other** people reach the limit. The holder may always
  use their own slot. A manager can override after a confirmation.
- The "Reserved soon" question appears only if starting would leave an upcoming booking within the confirmation window
  without a slot.
- **Lowering the limit** (or changing the type so that the limit drops) cancels the newest-created bookings that have
  not started yet and no longer fit, with the reason `machine capacity reduced` (stored and shown as is). Their
  holders get the email "Booking removed: {resource}" and the cancellations are recorded in the
  [audit log](settings/audit-log.md). Running bookings are never
  cancelled. Raising the limit cancels nothing.
- Handover and overrun notices on such machines are only sent when the holder would lack a slot.
- The **Reservations** card shows for each booking how many slots are reserved at the busiest moment of its period,
  buffers included, for example "2 of 3 slots reserved". The count turns red when every slot is taken.
- A reader shows "Reserved" only when no free slot is left; otherwise it shows a count such as "2 of 3 slots reserved"
  (in the short status row "2/3 reserved").

## My reservations

The sidebar entry **My reservations** lists your upcoming and past bookings with their status. Statuses:

| Status           | Meaning                                                      |
| ---------------- | ------------------------------------------------------------ |
| Pending approval | Waiting for a manager's decision. Does not block anyone yet. |
| Confirmed        | Approved or booked without approval. Blocks the slot.        |
| Rejected         | A manager declined the booking.                              |
| Cancelled        | Cancelled by you or by a manager.                            |
| Expired          | Still pending when its start time passed.                    |
| No show          | Nobody checked in before the end of the grace period.        |
| Completed        | The booking is over (or was ended early).                    |

You can cancel pending and upcoming bookings there, end a running booking early and follow the link to your
[calendar feeds](#calendar-feeds-ical).

## Approval

If the resource requires approval, a new booking is **pending** until a manager approves or rejects it (optionally
with a reason). You are notified of the decision. A booking that is still pending when it should start becomes
**expired**. A pending booking blocks other bookings, but it never blocks anybody from starting the resource.

## Check-in and no-show

When check-in is enabled for the resource, you check in simply by **starting a session on that resource** within
the check-in window: from a few minutes before your booking starts (the early check-in window) until it ends. You
do not need to do anything else, and a supervised start counts when you are the one who requested it.

A session of yours that is **already running** when your booking starts counts as well, for example when you started
before the early check-in window or kept your session running from your previous booking right before. Such a
session is recognised at the end of the grace period and checks you in then.

If you have not checked in by the start time plus the grace period, the booking becomes a **no show**, the slot
is freed for others and you receive an email. When the grace period is as long as the booking or longer, an unused
booking becomes a no show at its end. The current check-in settings of the resource apply, also to bookings made
before a change. If check-in is disabled for the resource, the booking simply stays until its end. Your confirmation and reminder emails state the check-in rules for that resource.

## Ending early: keep or free the rest

You can end a running booking early on **My reservations** or on the resource page. The slot is freed immediately.

When you stop your session during your own running booking, you are asked: **Keep it or free the rest?**

- On the web a dialog appears on the resource page ("Your booking runs until 16:00. Keep it or free the rest?").
  If you ignore it, the booking is kept. The question is remembered for 15 minutes.
- On an Attractap reader with a screen the question is shown after you stop. If nobody answers, **Keep** applies.

## Start protection and confirmation

When someone starts a resource, the plugin checks the bookings of **other** users. Only confirmed bookings count.

- **Someone else's booking is running:** the start is refused with "Reserved by another user until 16:00", or
  "Reserved by Alex Example until 16:00" if you may see who is using the machine (see
  [Who sees the name of the holder](#who-sees-the-name-of-the-holder)).
- **Someone else's booking starts soon:** if it starts within the resource's confirmation window (60 minutes by
  default), you are asked to confirm: "Reserved from 14:00, you have 40 min. Start anyway?". On a reader without a
  screen the start is refused by default. If several bookings start within the window, you confirm each of them.
- **Your own booking:** you may start during or shortly before your own booking without any question.
- **Maintainers and managers** can override a running booking after an explicit confirmation. The holder and the
  managers are notified, and the override is recorded in the [audit log](settings/audit-log.md).
- **Supervised starts** (a supervisor approves the request) cannot ask anybody for a confirmation, so a question
  there turns into a refusal.

Bookings that are only pending never block a start.

**The resource page shows a block before you press Start.** While someone else's booking is running and you may not
start, the page replaces the Start button with a notice, like the "you need an introduction" and "in use" notices: it
shows the plugin's title and reason, and the reason names the time the block ends ("Reserved by another user until
16:00."). The notice updates by itself when a booking begins, ends or is cancelled. If the page is out of date and you
press Start anyway, the start is still refused with the same message. Managers and maintainers do not see the notice;
they start through the override confirmation above.

## Who sees the name of the holder

The holder's name follows the rule Attraccess already uses for **who is currently using a machine**: whoever may see the
name of the current user of a resource may also see who holds a booking on it. Everyone else gets the anonymous text
("another user", "Reserved") and times only. Which rule applies is set by
[**Who can see resource activity**](settings/overview.md#resource-activity-visibility).

- **Sees the name:** the holder; managers and maintainers of the resource; everybody with **Manage Resource Access**
  (`resources.access.manage`); and everybody who may see the usage of the machine under that setting. With the default,
  **Everyone with Read Resources**, that is everybody with **Read Resources**; with **Only people introduced to the
  resource**, the people introduced to the machine.
- **Does not see the name:** people who may only see **Available** or **In Use** (supervised-use machines with the
  "introduced" setting), and people who may not see the machine's activity at all.
- **Where it applies:** the notice on the resource page, the refusal when you press Start (in the web interface, the API
  and on the reader), the availability view in the booking card, the calendar feeds and Attractap readers after a card tap (see [Attractap readers](#attractap-readers)). Notes, reasons and decisions of a booking stay visible to the holder and the
  managers only. Managers always get the override confirmation that names the holder.
- A calendar feed is checked when it is requested, with the permissions of the feed's owner at that time.

## Attractap readers

On an Attractap Touch reader with current firmware the plugin adds reservation information to the screen, asks
before a start that would collide with a booking, and treats a start on the reader as the check-in. The plugin
needs the permission to show widgets on Attractap reader screens, which an administrator approves when
installing or updating it (see [Reader display](attractap/reader-ui.md)). All times are in the plugin's
[timezone](plugins/reservations/administration.md#timezone), as `HH:MM`; a time on another day gets a short weekday ("Tue 09:00"). Only confirmed
bookings are shown. The reader's own status ("In use", maintenance and so on) always wins over the plugin's note.

**Before a card is tapped.** A reader nobody is signed in to shows times and states only, never names or other
personal data, whoever may otherwise see names:

| Situation                                                                                                                          | Resource list             | Resource details                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| Nothing running, nothing starts within 24 hours                                                                                    | nothing                   | nothing                                       |
| The next booking starts within 24 hours, none is running                                                                           | "Free until 14:00"        | "Free until 14:00, then reserved until 16:00" |
| A booking is running, check-in is required and not done yet, before the deadline                                                   | "Res., check in by 14:15" | "Reserved 14:00-16:00 (check in by 14:15)"    |
| A booking is running and checked in, check-in is turned off, or the check-in deadline passed without a check-in (not released yet) | "Reserved until 16:00"    | "Reserved 14:00-16:00"                        |

Each booking appears in one text on a screen, never twice: the details carry one line for the free time and the
booking that ends it. The list row holds 24 characters, so the open check-in is shortened there; a deadline on another day reads
"Res., check-in Tue 00:05". The details always have the full text. The lock screen of the resource shows the same
public line as the list row, in place of "Available" (not while the resource is in use or under maintenance).

**The current time.** Reader screens show the current time in the footer bar (the lock screen and the
signed-out list have a big clock instead, and the session summary after a stop shows no footer except while the
keep or free question is open), so "check in by 14:15" can be related to now. The plugin does not write
the time into its texts. The reader uses the plugin's [timezone](plugins/reservations/administration.md#timezone) for this clock, so the clock and the
reservation times always agree, even when the server runs in another zone; changing the timezone switches the
readers at once. The plugin proposes its timezone only for resources that have reservations enabled; for other
resources the server's timezone applies. See [Time and time zone](attractap/reader-ui.md#time-and-time-zone).

The times are the booking's start and end without buffers. Texts follow the installation's default language.

On an Attractap Touch with current firmware, a time such as "14:25" is never split across two lines. Each line holds
one part of a note, for example "Free until 13:55," above "then reserved by bea until 14:25", and the check-in note
"(check in by 14:10)" under the booking. With a long name, the times get a line of their own.

**After a card tap.** The texts follow the language of the person who tapped. When the card session ends, the reader
returns to the texts above.

- **Your own booking** (running, or starting within the early check-in window): the list shows "Your booking until
  16:00" ("Yours until Wed 16:00" when it ends on another day), the details "Your booking 14:00-16:00", with "(check
  in by 14:15)" while the check-in is still open.
- **Who may see the holder's name** (managers of the resource and everybody else who may see who uses the machine,
  see [Who sees the name of the holder](#who-sees-the-name-of-the-holder)) also sees it on the details ("Free until 14:00, then
  reserved by Alex until 16:00", "Reserved by Alex 14:00-16:00 (check in by 14:15)"). Everybody else sees the texts above.
- **Idle** (nobody is using the resource and no booking is running): the details body carries the free time and the next booking in one
  line, "Free until 14:00, then reserved by Alex until 16:00" (the name under the rules above, otherwise "Free
  until 14:00, then reserved until 16:00"). This also holds when that booking starts within the confirmation
  window; the reader shows no session area while nothing is running, so the body is the one place for it.
- **While a usage is running** (yours or somebody else's) and you are signed in, and another person's booking
  starts within the confirmation window, the session area shows that booking once, "Reserved by Alex 14:00-16:00"
  with a countdown (the name under the rules above, otherwise "Reserved 14:00-16:00"). The details body then shows
  nothing about that booking: no "Free until" line and no second text. When a usage starts, ends or is taken over,
  the reader moves the text between the two places within a few seconds.
- The **list never shows names**, signed in or not. Long names are shortened in the details.

**Starting on the reader.**

| Situation                                                      | What the reader does                                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another person's booking starts within the confirmation window | Asks "Reserved from 14:00, you have 40 min. Start anyway?" with a countdown. Cancel or no answer starts nothing. The holder is named only if you may see names. |
| Another person's booking is running                            | Refuses: "Reserved by another user until 16:00" (with the name, if you may see names). Managers get the override question instead and the holder is named.      |
| You start within your booking or its early check-in window     | No question. The start checks the booking in and the screen updates.                                                                                            |
| You stop a session inside your own running booking             | Asks "Keep it or free the rest?". **Free rest** ends the booking early. No answer within 15 seconds keeps the booking.                                          |

Freeing a booking without a session is only possible in the web UI. Booking itself is not possible on the reader.

**Readers without a screen.** Attractap Lite readers, Touch readers with older firmware and readers whose plugin
notes are paused after crashes cannot show anything of the above:

| Reader                | Reservation texts | Booking starts soon                                                                       | Another booking is running                  | Question after stopping   |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------- |
| Lite                  | none              | The plugin suggests blocking; the resource setting **Readers without a screen** decides.  | Refused (amber half ring, then a red flash) | none, the booking is kept |
| Touch, older firmware | none              | The same setting; a block shows a generic error. A second card tap is a Lite-only option. | Generic error                               | none, the booking is kept |
| Plugin notes paused   | none              | The same setting.                                                                         | Refused                                     | none, the booking is kept |

**Readers without a screen** is described under [Reader display](attractap/reader-ui.md#readers-without-a-screen):
**Plugin default** (the default; this plugin suggests blocking), **Block the start**, **Confirm with a second card tap**
(Lite only) or **Start with a warning**. The same setting decides a manager's override of a running booking; for
everybody else a running booking of another person is always refused. Check-in works on every reader type, as long as
the start is made by the holder.

## Reminders and notifications

You receive notifications in the app, as push message and by email, according to your notification preferences
(see [notification categories](plugins/reservations/administration.md#notification-categories)). Each notice is sent at most once. The texts use your
language when it is known, otherwise the default language of the installation. The emails are
[email templates](plugins/reservations/administration.md#email-templates) that administrators can edit.

| When                                            | What                                                                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking confirmed or approved                   | Confirmation including the check-in rules.                                                                                                                                                                                                   |
| 48 hours before the start                       | "Do you still need this booking?" with **Keep** and **Cancel**. Only if the booking was confirmed at least 48 hours ahead (for bookings that need approval: approved) and you have not already chosen **Keep**. No answer keeps the booking. |
| 24 hours before the start                       | Reminder including the check-in rules. Skipped for bookings confirmed (made or approved) less than 24 hours ahead: their confirmation email already carries the rules.                                                                       |
| Booking rejected, expired, cancelled or no show | Information about what happened and why.                                                                                                                                                                                                     |
| Maintenance overlaps your booking               | One notice per maintenance listing all your affected bookings. Bookings are not cancelled automatically.                                                                                                                                     |
| Resource becomes unhealthy / recovers           | For bookings that are running or start within 24 hours.                                                                                                                                                                                      |
| Before someone else's booking starts            | If you have a running session: "The resource is reserved from 14:00. Please end your session in time."                                                                                                                                       |
| Someone else's session still runs at your start | You and the other user are informed (checked during the first five minutes of your booking). The session is not ended.                                                                                                                       |
| Someone overrode your booking                   | You are told who started anyway.                                                                                                                                                                                                             |

Resources whose reservations are disabled send no reminders, handover or overrun notices for bookings that were kept
when disabling.

## Email links

Action links in emails ("Keep", "Cancel") are plain links to `/reservations/<id>?action=keep|cancel` in Attraccess.

- **A link never signs you in by itself** and contains no token. If you are not signed in, you log in as usual and
  are returned to the page.
- Opening the link changes nothing. The page asks for your confirmation in a dialog before it keeps or cancels
  the booking.

The links in emails are built from the **Application URL**, which has to be configured, as for every Attraccess email;
see [Settings → Application Settings](settings/overview.md#application-settings).

## Calendar feeds (iCal)

On your account page, the section **Calendar feeds (iCal)** lets you subscribe to bookings in any calendar app.

- You can have several feeds (up to 20), each with a name.
- Each feed has a **selection**. Combine one or more of: specific resources, resource groups, all resources you are
  introduced to, all resources you maintain, and only your own bookings.
- Only resources you may see **at the time the calendar is requested** are included.
- Confirmed bookings appear as events, pending bookings as **tentative** events. Cancelled bookings disappear. The
  feed covers the last 30 days up to the booking horizon of each resource.
- The title is "Resource – Name" for your own bookings, for resources you manage and for resources where you may see
  who is using the machine ([rule](#who-sees-the-name-of-the-holder)); otherwise it is "Resource – Reserved".

> [!WARNING]
> The feed URL is a secret: anybody who has it can read the feed without signing in. It is shown **only once**, when
> you create or regenerate the feed. Copy it right away. If it leaks, **regenerate** it (the old URL stops working
> immediately) or **revoke** the feed (the URL answers 404 from then on). Attraccess stores only a hash of the token.

Feeds are rate limited. Revoked and unknown feeds answer the same `404`.
