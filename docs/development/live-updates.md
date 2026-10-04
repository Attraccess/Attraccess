# Bundled UI live updates

The UI uses multiplexed SSE: one `GET /api/live-updates/:id/events` per tab,
API origin and authenticated session. Authenticated, short-lived
`PUT /api/live-updates/:id/subscriptions` requests replace its logical topic set
without restarting the stream. SSE keeps the existing HTTP cookie authentication,
proxy support and RxJS event producers; WebSockets would require a separate
upgrade authentication path. This avoids increasing long-lived connections as
resources/features are added. HTTP/1.1 SSE limits and negotiated HTTP/2 stream
limits differ; this is not a universal six-connection WebSocket limit.

`LiveUpdatesProvider` owns the transport. Components call `useLiveUpdates` with
`topic`, `resourceId` for resource topics, `onUpdate`, optional `enabled` and
`onReconnect`. The returned `abort` and effect cleanup are idempotent. The client
reference-counts consumers and isolates callback failures. Resource payloads,
flow logs, billing transactions, messages, system notifications and supervision
requests retain their domain shapes inside a shared typed topic/event envelope.
Heartbeat, readiness and rejection packets never enter feature callbacks.

The six topics are `resource`, `flow-logs`, `billing`, `messaging`,
`notifications` and `supervision`. The server validates positive, safe integer
resource IDs and resource existence; flow logs require `resources.update`.
Resource existence is checked in one query over unique IDs per set/lease renewal;
session permissions are revalidated for every topic on each renewal.
User topics always use the authenticated user, and supervision events are
restricted to the user explicitly selected as supervisor. Connections bind to
both user and a hash of the authenticated session credential. Controls cannot address another user's/session's
stream. Invalid/forbidden topics are rejected individually, retaining authorized
topics. Each set is limited to 256 topics. Monotonic revisions and serialized
updates prevent an older set from overwriting a newer navigation state.

A single heartbeat runs every ten seconds. Controls renew a thirty-second lease
and recheck session authentication and topic authorization every ten seconds.
The client detects a stalled stream after 35 seconds and reconnects using
exponential backoff with jitter, capped at thirty seconds. Retry delay resets
only after a healthy heartbeat. Only the current topic set is restored;
removed topics stay removed. After restoration, active React Query state is
invalidated once to recover persisted updates missed during interruption.
Resource subscriptions additionally receive their own initial in-use state.
Nonpersisted notifications and supervision events have no durable replay.

Messaging subscriptions retain online presence. Notification controls report
current tab visibility immediately on visibility changes and after reconnect.
The server tracks visible connections per user: any visible tab retains web
presence, and unsubscribe/disconnect removes only that connection's contribution.
Legacy web-presence reporting remains available for compatibility; the UI uses
only bundled controls. Connection UUIDs also work on plain HTTP through the
existing `uuid` library's `getRandomValues` fallback.
A rejected/expired session stops retries,
clears callbacks and clears cached authenticated state. Logout disposes the
transport before its HTTP request. A subsequent user gets a new provider/client.
On last unsubscribe or stream disconnect, RxJS subscriptions and unobserved
subjects are released. A disconnected tab whose TCP close is delayed expires
when its lease stops renewing. Deployments with multiple API workers must route
stream and controls to the same worker (sticky routing); domain producers are
already process-local. Cross-tab connection sharing is outside v1.

Legacy public SSE endpoints remain available for compatibility. The UI no longer
uses them. `attraccess_sse_active_connections{stream="live_updates"}` measures
physical bundled streams, while `attraccess_live_update_active_topics{topic=...}`
measures logical server subscriptions separately. Legacy connection metrics
retain their existing meanings.

## Registering a backend topic provider

`LiveTopicsModule` exports a shared `LiveTopicsService` registry and has no
feature dependencies. Each feature module imports it and declares its own
injectable adapter implementing `LiveTopicProvider`. The adapter injects its
existing producers and calls `registry.register(this)` in `onModuleInit`.
`LiveUpdatesModule` imports only the registry; adding a producer does not require
changing the registry or transport's imports, constructors or routing code.

A provider declares its topics and their `user` or `resource` scope. The registry
rejects unregistered topics, unexpected fields and invalid resource identifiers.
Duplicate topic ownership fails startup, with no partially applied registration.
User identity always comes from the authenticated session passed to `source`.

Providers own domain authorization and sources. The optional `authorize` hook
receives all subscriptions owned by that provider once per set/lease renewal and
returns rejection reasons keyed by `liveSubscriptionKey`. An omitted hook uses
the endpoint's session authentication. A failed provider rejects its own topics
while other providers continue. `ResourceLiveTopicsProvider` owns both resource
and flow-log topics, keeping resource existence validation in one shared query
and rechecking flow-log permissions on every renewal.

`source` returns an Observable (or a promise of one) wrapping the existing
producer. Allocate subjects lazily and release them on RxJS finalization.
The optional `setPresence` hook receives visibility controls for active topics
and `false` when a topic ends, is removed/revoked, or its connection disconnects.
`NotificationLiveTopicsProvider` owns web presence; `MessagingLiveTopicsProvider`
retains the producer's subscription-based online presence.

See the adapters in `billing`, `messaging`, `notifications`, `resources` and
`resources/supervision` for examples. Registration happens during Nest module
initialization; runtime plugin unloading is outside this contract. New protocol
topics still require updating the shared `LiveSubscription` type and frontend
payload types. This keeps client/server type checking without a hard-coded
producer list in the transport.
