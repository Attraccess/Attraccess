# Reservations
<!-- llms-description: The Reservations plugin lets members book a resource for a time window; overview, prerequisites and links to member, administrator and API pages. -->

> [!NOTE]
> Only available when the **Reservations** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

The **Reservations** plugin lets members book a resource for a specific time window in advance. While a booking is
active, nobody else can start the resource. Starting shortly before someone else's booking asks for a confirmation.
On machines with several parallel sessions a booking holds only one slot (see
[Machines with several parallel sessions](plugins/reservations/using-reservations.md#machines-with-several-parallel-sessions)).

The plugin never ends, locks or takes over a running session. It only blocks or asks before a session **starts**
and sends notifications. Reservations are disabled by default and are enabled per resource. On resources where they
are not enabled, nothing changes.

## Prerequisites

- Attraccess 1.11.0 or newer.
- The `reservations` plugin, installed as described in [Installing Plugins](plugins/installing-plugins.md). The
  permissions it requests are listed in [Administering Reservations](plugins/reservations/administration.md#installing-the-plugin).
- Optional: a working [SMTP configuration](setup/smtp-email.md) for email notices. Without it, in-app and push
  notifications still work.

## Where it appears

- A booking card on the resource detail page and a **My reservations** list for members.
- A **Manage reservations** page in the sidebar for resource managers (approvals and all bookings).
- A **Reservations** section in the resource settings and in the system settings (timezone) for administrators.
- Attractap readers with a display, which show booking notes and ask follow-up questions (see
  [Reader Display](attractap/reader-ui.md)).
- **Calendar feeds (iCal)** on the user's account page, plus notifications and email links.

## In this section

| Page                                                                 | For             | Covers                                                                    |
| -------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| [Using Reservations](plugins/reservations/using-reservations.md)     | Members         | Booking, check-in, approval, start protection, readers, feeds             |
| [Administering Reservations](plugins/reservations/administration.md) | Administrators  | Installation, per-resource settings, timezone, email templates, audit log |
| [Reservations API](plugins/reservations/api.md)                      | Integrators     | REST endpoints and error codes                                            |

## See also

- [Resources overview](resources/overview.md)
- [Maintenance](resources/maintenance.md)
- [Reader display](attractap/reader-ui.md)
- [Developing Plugins](plugins/developing-plugins.md)
