# Reservations API
<!-- llms-description: Reference for the Reservations plugin API, including error codes. -->

> [!NOTE]
> Only available when the **Reservations** plugin is installed. See [Installing Plugins](plugins/installing-plugins.md).

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

## Error codes

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
