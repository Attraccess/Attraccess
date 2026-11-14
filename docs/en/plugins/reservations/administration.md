# Administering Reservations
<!-- llms-description: How administrators install, configure and operate the Reservations plugin: timezone, email templates, start checks and audit log. -->

> [!NOTE]
> Only available when the **Reservations** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

## Installing the plugin

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
| `READER_UI`          | Booking notes and follow-up questions on Attractap reader displays.                |

3. The plugin needs Attraccess 1.11.0 or newer.

Email notices need a working [SMTP configuration](setup/smtp-email.md). Without it, in-app and push notifications
still work.

## Enabling reservations for a resource

Open the resource's settings page. The **Reservations** section is shown to users with the **Manage Resources**
permission (the API also allows the resource's maintainers). Reservations are **disabled** by default.

| Setting                         | Default      | Allowed values / meaning                                                                                    |
| ------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| Reservations enabled            | off          | Turns the feature on for this resource.                                                                     |
| Approval required               | off          | New bookings are pending until a manager decides. Applies to managers' own bookings, too.                   |
| Time step (minutes)             | 15           | 5 to 240, must divide 1440. Start and duration snap to this grid.                                           |
| Minimum duration (minutes)      | 15           | 1 to 1440, a multiple of the time step.                                                                     |
| Maximum duration (minutes)      | 240          | 1 to 10080, a multiple of the time step, not below the minimum.                                             |
| Maximum advance (days)          | 30           | 1 to 730. How far ahead bookings are possible.                                                              |
| Minimum lead time (minutes)     | 0            | 0 to 10080. The latest a booking can be made before its start. 0 means up to the start (never in the past). |
| Buffer before / after (minutes) | 0 / 0        | 0 to 1440 each. Kept free around a booking and counted for overlaps.                                        |
| Active bookings per user        | 3            | 0 to 100 (pending and confirmed with a future end). 0 means unlimited.                                      |
| Who can book                    | `can-start`  | `can-start`, `managers-only` or `any-user`.                                                                 |
| Confirmation window (minutes)   | 60           | 0 to 1440. Starting this close before someone else's booking asks for confirmation. 0 means never ask.      |
| Check-in enabled                | on           | Bookings need a session start to avoid becoming a no show.                                                  |
| Check-in grace (minutes)        | 15           | 1 to 240. Time after the start until a booking without check-in becomes a no show.                          |
| Early check-in (minutes)        | 15           | 0 to 240. How long before the start a check-in counts.                                                      |
| Handover reminder (minutes)     | 15           | 0 to 1440. Notifies users with a running session this long before a reservation starts.                     |
| Bookable hours                  | empty (24/7) | Per weekday, zero or more ranges `HH:mm-HH:mm`.                                                             |

Changes affect only **new** bookings; existing bookings are kept. The confirmation window and the check-in rules
always use the current values.

**Manager roles.** Managers of a resource are users with the **Manage Resources** permission plus the maintainers
and introducers of the resource or its group. They see all bookings, approve and reject, cancel any booking with a
reason, end any running booking early and edit the resource's reservation settings. The sidebar entry **Manage
reservations** lists pending approvals and all bookings with filters. Maintainers without the **Manage Resources**
permission may have to reload the page once before the entry appears.

### Bookable hours

Bookable hours apply to **bookings only**, not to spontaneous starts. The rule: once **any** weekday has a range,
weekdays without a range are **closed**. With no ranges at all, the resource is bookable around the clock. A booking
including its buffers must lie completely inside one range on one day. Ranges that touch on the same day stay
separate: with 08:00-12:00 and 12:00-16:00 a booking from 11:00 to 13:00 is refused. Only a range ending at 24:00
joins the next day's range starting at 00:00.

### Disabling reservations

If you disable reservations while pending or confirmed future bookings exist, the settings page warns you with the
number of affected bookings. When you confirm, those bookings are cancelled with the reason "reservations
disabled" and their holders are notified (in the background, so saving returns right away). A booking that someone
creates at the same moment is either cancelled with the others or refused. After disabling, every start is allowed
again.

## Timezone

The plugin's timezone is a global setting in the **Reservations** section of the system settings (visible to users
with the system settings permission). It defaults to the server's timezone. It is used for bookable hours, the
time-step grid, texts in emails and notifications and the calendar feeds. Times are stored in UTC and daylight
saving time is handled.

## Notification categories

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

## Email templates

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

## Start checks and hook failures

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

## Maintenance and health

- A booking cannot be made across a maintenance window, including open-ended maintenance (it counts from its start
  until it is finished).
- When maintenance is created or changed and overlaps existing bookings, each holder gets **one** notice that lists
  all of their affected bookings. If a change later affects more of their bookings, they get one more notice that
  lists only the newly affected ones. Bookings are **not** cancelled automatically; managers decide.
- When a resource becomes unhealthy, holders of bookings running or starting within 24 hours are told, and again
  once it recovers.

## Audit log

The plugin records the audit domain **reservations**: `created`, `approved`, `rejected`, `cancelled`,
`ended_early`, `no_show`, `expired`, `override_start`, `settings_changed`, `feed_created` and `feed_revoked`. See
[Audit log](settings/audit-log.md).

## Single-instance operation

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
