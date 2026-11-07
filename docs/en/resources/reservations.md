# Reservations
<!-- llms-description: The Reservations plugin lets members book a resource for a time window; covers member use, administration and the API. -->

The **Reservations** plugin lets members book a resource for a specific time window in advance. While a booking is
active, nobody else can start the resource. Starting shortly before someone else's booking asks for a confirmation.

> [!NOTE]
> Reservations are provided by the official `reservations` plugin. Install it first (see
> [Installing the plugin](#installing-the-plugin)) and enable reservations per resource. Without the plugin, or on a
> resource where reservations are not enabled, nothing changes.

The plugin never ends, locks or takes over a running session. It only blocks or asks before a session **starts**
and sends notifications.

## For members

### Booking a resource

1. Open the resource's [detail page](resources/resource-details.md). On resources with reservations enabled you see a
   **Reservations** card with a day and a week view. Your own bookings are highlighted; other people's bookings
   appear as **Reserved**.
2. Click **Reserve**.
3. Choose the date, the start time and the duration. Start and duration follow the resource's time step (for
   example 15 minutes), and only valid slots can be selected. The dialog also shows the check-in rules and whether
   a manager has to approve the booking.
4. Confirm. The booking is **confirmed** right away, or **pending** if the resource requires approval.

All times are shown in the plugin's configured [timezone](#timezone).

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

On a machine with `maxParallelSessions > 1` a booking reserves the **whole** resource.

### My reservations

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

### Approval

If the resource requires approval, a new booking is **pending** until a manager approves or rejects it (optionally
with a reason). You are notified of the decision. A booking that is still pending when it should start becomes
**expired**. A pending booking blocks other bookings, but it never blocks anybody from starting the resource.

### Check-in and no-show

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

### Ending early: keep or free the rest

You can end a running booking early on **My reservations** or on the resource page. The slot is freed immediately.

When you stop your session during your own running booking, you are asked: **Keep it or free the rest?**

- On the web a dialog appears on the resource page ("Your booking runs until 16:00. Keep it or free the rest?").
  If you ignore it, the booking is kept. The question is remembered for 15 minutes.
- On an Attractap reader with a screen the question is shown after you stop. If nobody answers, **Keep** applies.

### Start protection and confirmation

When someone starts a resource, the plugin checks the bookings of **other** users. Only confirmed bookings count.

- **Someone else's booking is running:** the start is refused with "Reserved by another user until 16:00", or
  "Reserved by Alex Example until 16:00" if you may see who is using the machine (see
  [Who sees the holder's name](#who-sees-the-holders-name)).
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

### Who sees the holder's name

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
  and on the reader), the availability view in the booking card and the calendar feeds. Notes, reasons and decisions of a booking stay visible to the holder and the
  managers only. Managers always get the override confirmation that names the holder.
- A calendar feed is checked when it is requested, with the permissions of the feed's owner at that time.

### Attractap readers

On an Attractap Touch reader (firmware 1.9.0 or newer) the plugin adds reservation information to the screen, asks
before a start that would collide with a booking, and treats a start on the reader as the check-in. The plugin
needs the permission to show widgets on Attractap reader screens, which an administrator approves when
installing or updating it (see [Reader display](attractap/reader-ui.md)). All times are in the plugin's
[timezone](#timezone), as `HH:MM`; a time on another day gets a short weekday ("Tue 09:00"). Only confirmed
bookings are shown. The reader's own status ("In use", maintenance and so on) always wins over the plugin's note.

**Before a card is tapped.** A reader nobody is signed in to shows times and states only, never names or other
personal data, whatever the settings:

| Situation                                                                        | Resource list          | Resource details                           |
| -------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Nothing running, nothing starts within 24 hours                                  | nothing                | nothing                                    |
| The next booking starts within 24 hours, none is running                         | "Free until 14:00"     | "Free until 14:00", "Reserved 14:00-16:00" |
| A booking is running, check-in is required and not done yet, before the deadline | "Check in by 14:15"    | "Reserved 14:00-16:00 - check in by 14:15" |
| A booking is running and checked in (or check-in is turned off)                  | "Reserved until 16:00" | "Reserved 14:00-16:00"                     |

The times are the booking's start and end without buffers. Texts follow the installation's default language.

**After a card tap.** The texts follow the language of the person who tapped. When the card session ends, the reader
returns to the texts above.

- **Your own booking** (running, or starting within the early check-in window): the list shows "Your booking until
  16:00", the details "Your booking 14:00-16:00", with "check in by 14:15" while the check-in is still open.
- **Managers of the resource** also see who holds a booking on the details ("Reserved by Alex 14:00-16:00").
- **Everybody else** sees the texts above, unless the resource turns on **Show names on readers**; then the details
  name the holder, too.
- **While you are using the resource** and somebody else's booking starts within the confirmation window, the
  session area shows "Reserved from 14:00" with a countdown (with the name under the rules above).
- The **list never shows names**, signed in or not. Long names are shortened.

**Starting on the reader.**

| Situation                                                      | What the reader does                                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another person's booking starts within the confirmation window | Asks "Reserved from 14:00, you have 40 min. Start anyway?" with a countdown. Cancel or no answer starts nothing. The holder is named only if you may see names. |
| Another person's booking is running                            | Refuses: "Reserved by another user until 16:00" (with the name, if you may see names). Managers get the override question instead and the holder is named.      |
| You start within your booking or its early check-in window     | No question. The start checks the booking in and the screen updates.                                                                                            |
| You stop a session inside your own running booking             | Asks "Keep or free the rest?". **Free rest** ends the booking early. No answer within 15 seconds keeps the booking.                                             |

Freeing a booking without a session is only possible in the web UI. Booking itself is not possible on the reader.

**Show names on readers** (resource setting, off by default). It only changes what a person sees **after tapping a
card** and who is not the holder or a manager: holder names on the resource details and in the reader's confirmation
and refusal texts. It never affects a signed-out reader. The switch's help text says: "Names are shown only after
someone taps their card." Saving it updates the readers right away.

**Readers without a screen.** Attractap Lite readers, Touch readers with older firmware and readers whose plugin
notes are paused after crashes cannot show anything of the above:

| Reader                | Reservation texts | Booking starts soon                                                                       | Another booking is running                  | Question after stopping   |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------- |
| Lite                  | none              | The plugin suggests blocking; the resource setting **Readers without a screen** decides.  | Refused (amber half ring, then a red flash) | none, the booking is kept |
| Touch, older firmware | none              | The same setting; a block shows a generic error. A second card tap is a Lite-only option. | Generic error                               | none, the booking is kept |
| Plugin notes paused   | none              | The same setting.                                                                         | Refused                                     | none, the booking is kept |

**Readers without a screen** is described under [Reader display](attractap/reader-ui.md#readers-without-a-screen):
**Block the start** (default), **Confirm with a second card tap** (Lite only) or **Start with a warning**. A manager's
override of a running booking always needs a screen and is blocked without one. Check-in works on every reader type,
as long as the start is made by the holder.

### Reminders and notifications

You receive notifications in the app, as push message and by email, according to your notification preferences
(see [notification categories](#notification-categories)). Each notice is sent at most once. The texts use your
language when it is known, otherwise the default language of the installation. The emails are
[email templates](#email-templates) that administrators can edit.

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

### Email links

Action links in emails ("Keep", "Cancel") are plain links to `/reservations/<id>?action=keep|cancel` in Attraccess.

- **A link never signs you in by itself** and contains no token. If you are not signed in, you log in as usual and
  are returned to the page.
- Opening the link changes nothing. The page asks for your confirmation in a dialog before it keeps or cancels
  the booking.

The links in emails are built from the application's public URL (`backend_url`), which has to be configured, as for
every Attraccess email; see [Environment variables](installation/environment-variables.md).

### Calendar feeds (iCal)

On your account page, the section **Calendar feeds (iCal)** lets you subscribe to bookings in any calendar app.

- You can have several feeds (up to 20), each with a name.
- Each feed has a **selection**. Combine one or more of: specific resources, resource groups, all resources you are
  introduced to, all resources you maintain, and only your own bookings.
- Only resources you may see **at the time the calendar is requested** are included.
- Confirmed bookings appear as events, pending bookings as **tentative** events. Cancelled bookings disappear. The
  feed covers the last 30 days up to the booking horizon of each resource.
- The title is "Resource – Name" for your own bookings, for resources you manage and for resources where you may see
  who is using the machine ([rule](#who-sees-the-holders-name)); otherwise it is "Resource – Reserved".

> [!WARNING]
> The feed URL is a secret: anybody who has it can read the feed without signing in. It is shown **only once**, when
> you create or regenerate the feed. Copy it right away. If it leaks, **regenerate** it (the old URL stops working
> immediately) or **revoke** the feed (the URL answers 404 from then on). Attraccess stores only a hash of the token.

Feeds are rate limited. Revoked and unknown feeds answer the same `404`.

## For administrators

### Installing the plugin

1. Open **Settings → Plugins** and install the `reservations` plugin as described in
   [Installing Plugins](plugins/installing-plugins.md).
2. Review and trust the requested permissions:

| Permission           | Used for                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_ACCESS`    | Its own tables for bookings, settings, calendar feeds and sent notices.            |
| `ACCESS_HOOKS`       | The pre-start check (block or confirm) and the "keep or free the rest?" question.  |
| `LISTEN_EVENTS`      | Session start/end, maintenance and health changes (check-in, notices).             |
| `ACCESS_RESOURCES`   | Read-only checks of who may start or maintain a resource, and maintenance windows. |
| `READ_USERS`         | Names and languages of holders and managers.                                       |
| `READ_SETTINGS`      | The public application URL for calendar feed links, and the default language.      |
| `SEND_NOTIFICATIONS` | In-app, push and email notifications.                                              |

3. The plugin needs Attraccess 1.11.0 or newer.

Email notices need a working [SMTP configuration](setup/smtp-email.md). Without it, in-app and push notifications
still work.

### Enabling reservations for a resource

Open the resource's settings page. The **Reservations** section is shown to users with the **Manage Resources**
permission (the API also allows the resource's maintainers). Reservations are **disabled** by default.

| Setting                         | Default      | Allowed values / meaning                                                                                                                    |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Reservations enabled            | off          | Turns the feature on for this resource.                                                                                                     |
| Approval required               | off          | New bookings are pending until a manager decides. Applies to managers' own bookings, too.                                                   |
| Time step (minutes)             | 15           | 5 to 240, must divide 1440. Start and duration snap to this grid.                                                                           |
| Minimum duration (minutes)      | 15           | 1 to 1440, a multiple of the time step.                                                                                                     |
| Maximum duration (minutes)      | 240          | 1 to 10080, a multiple of the time step, not below the minimum.                                                                             |
| Maximum advance (days)          | 30           | 1 to 730. How far ahead bookings are possible.                                                                                              |
| Minimum lead time (minutes)     | 0            | 0 to 10080. The latest a booking can be made before its start. 0 means up to the start (never in the past).                                 |
| Buffer before / after (minutes) | 0 / 0        | 0 to 1440 each. Kept free around a booking and counted for overlaps.                                                                        |
| Active bookings per user        | 3            | 0 to 100 (pending and confirmed with a future end). 0 means unlimited.                                                                      |
| Who can book                    | `can-start`  | `can-start`, `managers-only` or `any-user`.                                                                                                 |
| Confirmation window (minutes)   | 60           | 0 to 1440. Starting this close before someone else's booking asks for confirmation. 0 means never ask.                                      |
| Check-in enabled                | on           | Bookings need a session start to avoid becoming a no show.                                                                                  |
| Check-in grace (minutes)        | 15           | 1 to 240. Time after the start until a booking without check-in becomes a no show.                                                          |
| Early check-in (minutes)        | 15           | 0 to 240. How long before the start a check-in counts.                                                                                      |
| Handover reminder (minutes)     | 15           | 0 to 1440. Notifies users with a running session this long before a reservation starts.                                                     |
| Show names on readers           | off          | Signed-in card users who are neither holder nor manager see holder names on Attractap readers, see [Attractap readers](#attractap-readers). |
| Bookable hours                  | empty (24/7) | Per weekday, zero or more ranges `HH:mm-HH:mm`.                                                                                             |

Changes affect only **new** bookings; existing bookings are kept. The confirmation window and the check-in rules
always use the current values.

**Manager roles.** Managers of a resource are users with the **Manage Resources** permission plus the maintainers
and introducers of the resource or its group. They see all bookings, approve and reject, cancel any booking with a
reason, end any running booking early and edit the resource's reservation settings. The sidebar entry **Manage
reservations** lists pending approvals and all bookings with filters. Maintainers without the **Manage Resources**
permission may have to reload the page once before the entry appears.

#### Bookable hours

Bookable hours apply to **bookings only**, not to spontaneous starts. The rule: once **any** weekday has a range,
weekdays without a range are **closed**. With no ranges at all, the resource is bookable around the clock. A booking
including its buffers must lie completely inside one range on one day. Ranges that touch on the same day stay
separate: with 08:00-12:00 and 12:00-16:00 a booking from 11:00 to 13:00 is refused. Only a range ending at 24:00
joins the next day's range starting at 00:00.

#### Disabling reservations

If you disable reservations while pending or confirmed future bookings exist, the settings page warns you with the
number of affected bookings. When you confirm, those bookings are cancelled with the reason "reservations
disabled" and their holders are notified (in the background, so saving returns right away). A booking that someone
creates at the same moment is either cancelled with the others or refused. After disabling, every start is allowed
again.

### Timezone

The plugin's timezone is a global setting in the **Reservations** section of the system settings (visible to users
with the system settings permission). It defaults to the server's timezone. It is used for bookable hours, the
time-step grid, texts in emails and notifications and the calendar feeds. Times are stored in UTC and daylight
saving time is handled.

### Notification categories

Notifications use these categories, which every user can set per channel (in-app, push, email) in their
notification preferences under the plugin's name:

| Category                   | Contains                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| Reservations: my bookings  | Confirmations, cancellations, early ends, no shows.                 |
| Reservations: approvals    | New pending bookings (managers), decisions and expiry (holders).    |
| Reservations: reminders    | The 48 hour question and the 24 hour reminder.                      |
| Reservations: availability | Maintenance overlapping a booking, resource unhealthy or recovered. |
| Reservations: handover     | Handover reminders and overrun notices.                             |
| Reservations: overrides    | A maintainer or manager started during a booking.                   |

### Email templates

Every email of the plugin is an **email template** that you edit like the system's own emails, under
**Settings → Email → Templates**. The plugin's templates are listed after the system templates, marked "Plugin:
reservations":

| Template                                                                                                      | Sent when                                                                  |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Booking request awaiting approval                                                                             | A booking waits for approval (to the managers).                            |
| Booking confirmed                                                                                             | A booking is confirmed or approved, with the check-in rules.               |
| Booking rejected / Booking request expired                                                                    | A request was rejected, or nobody decided before its start.                |
| Booking cancelled by a manager / Running booking ended early / Booking removed (reservations switched off)    | A manager changed or removed a booking, or reservations were switched off. |
| Not checked in, booking released                                                                              | A booking was released as a no-show.                                       |
| Reminder 48 h before: still needed? / Reminder 24 h before                                                    | The reminders before a booking.                                            |
| Maintenance affects a booking / Resource has a problem / Resource works again                                 | Maintenance or the health of the resource affects a booking.               |
| Reserved soon (to the current user) / Booking started, resource still in use / Booking started, please finish | Handover and overrun notices.                                              |
| Started during a booking (to the holder / to the managers)                                                    | A manager started during a booking.                                        |

- Edit the subject and the body in the visual editor, and the German and English texts in the **Translations**
  dialog. **Variables** lists what you can use, for example `{{reservation.when}}` or `{{resource.name}}`.
- **The templates are yours once stored.** The plugin's subject, body and shipped translations are copied only when a
  template is stored for the first time (when the plugin is installed, or when an update adds a new template). After
  that, subject, body and translations belong to the administrators: updating the plugin never overwrites them,
  whether you changed them or not. **Reset to default** restores the version shipped with the installed plugin,
  including its translations; use it to get improved texts from a plugin update.
- Each recipient gets the mail in their own language; the notification categories still decide who receives which
  mail. Emails need the [SMTP configuration](setup/smtp-email.md) and the application URL, as all Attraccess emails.
- If you disable or uninstall the plugin, its templates are hidden and kept for later.

### Start checks and hook failures

The start checks run through the plugin's **pre-start hook**, for readers, the web UI, the API and supervision
approval alike. Resources with reservations disabled are answered from an in-memory settings cache without any
database access.

If the plugin cannot answer (timeout, error, too many failures in a row), the resource's **hook failure policy**
decides. You find it under the resource's **Reader display** settings (see [Reader display](attractap/reader-ui.md))
as "If the plugin's check fails". The default is **fail closed**: the start is refused with "Temporarily
unavailable". Choosing "Allow the start" (fail open) lets starts through while the check is unavailable, including
starts that would conflict with a booking. The setting only has an effect while the check fails; every such start is
recorded in the audit log. See [Developing Plugins](plugins/developing-plugins.md#failures-and-trust) for details.

**Supervision.** A supervisor approving a request cannot confirm on behalf of the requester. A start that would
normally ask for a confirmation is therefore refused on that path.

### Maintenance and health

- A booking cannot be made across a maintenance window, including open-ended maintenance (it counts from its start
  until it is finished).
- When maintenance is created or changed and overlaps existing bookings, each holder gets **one** notice that lists
  all of their affected bookings. If a change later affects more of their bookings, they get one more notice that
  lists only the newly affected ones. Bookings are **not** cancelled automatically; managers decide.
- When a resource becomes unhealthy, holders of bookings running or starting within 24 hours are told, and again
  once it recovers.

### Audit log

The plugin records the audit domain **reservations**: `created`, `approved`, `rejected`, `cancelled`,
`ended_early`, `no_show`, `expired`, `override_start`, `settings_changed`, `feed_created` and `feed_revoked`. See
[Audit log](settings/audit-log.md).

### Single-instance operation

> [!WARNING]
> The plugin supports **one** API instance. Its minute scheduler, the per-resource booking lock, the settings cache,
> the "keep or free the rest?" decisions and the feed rate limiter live in the API process. Two instances would
> run the scheduler twice and would neither serialize bookings nor refresh each other's caches. Distributed locking
> and cache invalidation are tracked as **ATT-1146**.

Behaviour you should know about:

- The scheduler ticks once a minute (expiry, no-show, completion, reminders, handover, overrun). Each notice is
  claimed in the database before it is sent, so restarts and double ticks never send a notice twice. Notices are
  **at most once**: if sending fails after the claim, it is not retried.
- The overrun check runs only during the first five minutes of a booking. If the API is down for longer than that
  around a booking's start, that overrun notice is skipped.
- Notifications triggered by an action (booking, approval, cancellation, ending early, disabling) are sent in the
  background after the change is saved, so the action does not wait for the mail server.
- The pending "keep or free the rest?" decisions of web users are held in memory. After an API restart the question
  is gone and the booking is kept.

## Using the API

All endpoints are under `/api/reservations` and accept a session cookie **or** an API token
(`Authorization: Bearer <token>`, see the [API reference](developer/api-reference.md)). Times are ISO 8601.
An API token acts with the token's permissions: manager actions (approving, cancelling or ending other people's
bookings, the manager list, resource settings, managers-only booking) need `resources.update` on the token itself.
Maintainer and introducer rights from your roles still apply.
Creating a calendar feed and regenerating its URL need a browser session (403 with an API token), because a feed URL
shows your bookings with all your rights, like an API token does.
Starting a resource with an API token goes through the core start check and the plugin's start check, and both apply
the token's permissions: without `resources.update` on the token (and without a maintainer or introducer role) you get
the block instead of the override confirmation, and the block names the holder only if the token may see who uses the
machine.

| Method and path                                             | Purpose                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /resources/:resourceId/availability?from=&to=`         | Bookings, rules and your booking permission for a range (at most 62 days).             |
| `GET /resources/:resourceId/pending-decision`               | Your running booking awaiting a keep/free answer, or `null`.                           |
| `POST /`                                                    | Book (`resourceId`, `startTime`, and `endTime` or `durationMinutes`, optional `note`). |
| `GET /mine?scope=upcoming\|past&status=`                    | Your bookings.                                                                         |
| `GET /manage?resourceId=&status=&from=&to=&page=`           | Bookings of the resources you manage (25 per page); 403 if you manage none.            |
| `GET /:id`                                                  | One booking (holder or manager).                                                       |
| `POST /:id/cancel`                                          | Cancel (body: optional `reason`, used by managers).                                    |
| `POST /:id/end-early`                                       | End a running booking now.                                                             |
| `POST /:id/keep`                                            | Keep the booking (holder only).                                                        |
| `POST /:id/approve`, `POST /:id/reject`                     | Decide a pending booking (managers, optional `reason`).                                |
| `GET /resources/:resourceId/manager-access`                 | Whether you manage the resource.                                                       |
| `GET` / `PUT /resources/:resourceId/settings`               | Read or update the resource's settings (managers). `PUT` is a partial update.          |
| `GET /resources/:resourceId/settings/future-bookings-count` | Bookings that disabling would cancel.                                                  |
| `GET` / `PUT /settings/global`                              | Plugin-wide settings (timezone). `PUT` needs `system.settings.manage`.                 |
| `GET`, `POST /ical/feeds`                                   | List or create your calendar feeds.                                                    |
| `PATCH`, `DELETE /ical/feeds/:id`                           | Rename or re-select a feed, or revoke it.                                              |
| `POST /ical/feeds/:id/regenerate`                           | Issue a new secret URL.                                                                |
| `GET /ical/<token>.ics`                                     | The calendar (no session; the token is the credential).                                |

Example: book a resource for 60 minutes with an API token.

```bash
curl -X POST https://your-attraccess-instance/api/reservations \
  -H "Authorization: Bearer $ATTRACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "resourceId": 3, "startTime": "2026-12-01T14:00:00Z", "durationMinutes": 60 }'
```

Disabling reservations through `PUT /resources/:resourceId/settings` with `"enabled": false` answers
`409 FUTURE_BOOKINGS_EXIST` while future bookings exist, unless the request also sends
`"cancelFutureBookings": true`.

### Error codes

Rule violations answer with `{ "code": "...", "message": "..." }`.

| Code                                                                                       | Status | Meaning                                                       |
| ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------- |
| `RESERVATIONS_DISABLED`                                                                    | 409    | Reservations are not enabled for the resource.                |
| `NOT_ALLOWED_TO_BOOK`                                                                      | 409    | Not allowed by the "who can book" setting.                    |
| `IN_THE_PAST`                                                                              | 409    | The booking would start in the past.                          |
| `OFF_TIME_STEP`                                                                            | 409    | Start or duration is off the time step.                       |
| `DURATION_TOO_SHORT`, `DURATION_TOO_LONG`                                                  | 409    | Outside the minimum or maximum duration.                      |
| `BEYOND_MAX_ADVANCE`                                                                       | 409    | Further ahead than the maximum advance.                       |
| `LEAD_TIME_TOO_SHORT`                                                                      | 409    | Too late for the minimum lead time.                           |
| `OUTSIDE_BOOKABLE_HOURS`                                                                   | 409    | Not fully inside the bookable hours.                          |
| `USER_BOOKING_LIMIT`                                                                       | 409    | Maximum active bookings per user reached.                     |
| `OVERLAP`                                                                                  | 409    | Overlaps another pending or confirmed booking (with buffers). |
| `MAINTENANCE`                                                                              | 409    | Overlaps a maintenance window.                                |
| `NOT_PENDING`, `NOT_ACTIVE`, `NOT_CANCELLABLE`                                             | 409    | The booking is not in a state that allows this action.        |
| `ALREADY_STARTED`, `ALREADY_FINISHED`                                                      | 409    | The booking has already started or finished.                  |
| `FUTURE_BOOKINGS_EXIST`                                                                    | 409    | Disabling would cancel future bookings; confirm explicitly.   |
| `FEED_LIMIT`                                                                               | 409    | Maximum number of calendar feeds reached.                     |
| `INVALID_RANGE`, `INVALID_SETTINGS`, `INVALID_TIMEZONE`, `RANGE_TOO_LARGE`, `INVALID_FEED` | 400    | The request is malformed or a value is invalid.               |
| `FORBIDDEN`                                                                                | 403    | You may not do this.                                          |
| `RESERVATION_NOT_FOUND`, `RESOURCE_NOT_FOUND`, `FEED_NOT_FOUND`                            | 404    | The object does not exist (or you may not see it).            |

> [!NOTE]
> Plugin routes appear in the **runtime** OpenAPI documentation of a running instance at `/api`. They are **not**
> part of the exported Swagger file and the generated API client, which are built without plugins.

## See also

- [Resources overview](resources/overview.md)
- [Maintenance](resources/maintenance.md)
- [Reader display](attractap/reader-ui.md)
- [Installing Plugins](plugins/installing-plugins.md)
- [Developing Plugins](plugins/developing-plugins.md)
