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
`onReconnect` and `onUnavailable`. The returned `abort` and effect cleanup are idempotent.
The returned `owner` identity scopes accumulated feature state to the current
authentication context; flow logs reset immediately when it or the resource changes. The client
reference-counts consumers and isolates callback failures. Resource payloads,
flow logs, billing transactions, messages, system notifications and supervision
requests retain their domain shapes inside a shared typed topic/event envelope.
Heartbeat, readiness and rejection packets never enter `onUpdate`.
The optional `onUnavailable` callback reports a rejection only to that topic's
consumers, and interruption to every active topic on the connection. It fires
once per outage, including for consumers joining during that outage, and resets
after a new event. It does not fire on intentional unsubscribe or logout.
Like update/reconnect callbacks, it is isolated and guarded against obsolete owners.
The plugin SDK exposes the same callback. WAGO uses it to retain cached snapshots
while marking exact queries unavailable and disabling dependent controls, without
per-browser REST fallback; subsequent shared snapshots restore success.

Departing callbacks are removed immediately. Subscription reconciliation and
final-consumer teardown share a microtask boundary, so cleanup/setup within the
same React lifecycle batch retains the physical connection, including StrictMode
and same-key remounts. Still-empty entries are then pruned; genuine final cleanup
aborts the stream and releases retries, timers and the visibility listener.
Logout and explicit disposal remain synchronous.

The six topics are `resource`, `flow-logs`, `billing`, `messaging`,
`notifications` and `supervision`. The server validates positive, safe integer
resource IDs and resource existence; flow logs require `resources.update`.
Resource existence is checked in one query over unique IDs per set/lease renewal;
session permissions are revalidated for every topic on each renewal.
User topics always use the authenticated user, and supervision events are
restricted to the user explicitly selected as supervisor. Connections bind to
both user and a hash of the authenticated session credential. Cross-user controls
are forbidden. If a valid authenticated control belongs to the same user but its
credential hash changed, it returns HTTP 403 with JSON code
`LIVE_UPDATES_SESSION_CHANGED`, without applying the control to the old stream.
Only that explicit control-response code triggers recovery with a fresh connection
ID under current credentials, retaining active subscriptions and authenticated
query state. Stream authentication failures and ordinary control 401/403 responses
expire the client. Error-body reads retain transport/authentication ownership
checks, so late responses cannot expire or recover a replacement context.
Invalid/forbidden topics are rejected individually, retaining authorized
topics. Each set is limited to 256 topics. Monotonic revisions and serialized
updates prevent an older set from overwriting a newer navigation state.

A single heartbeat runs every ten seconds. Controls renew a thirty-second lease
and recheck session authentication and topic authorization every ten seconds.
The client detects a stalled stream after 35 seconds and reconnects using
exponential backoff with jitter, capped at thirty seconds. Retry delay resets
only after a healthy heartbeat. Only the current topic set is restored;
removed topics stay removed. After restoration, active React Query state is
invalidated once by the host to recover persisted updates missed during interruption.
Core and plugin consumers must not repeat this query invalidation in
`onReconnect`; reserve that callback for state outside React Query.
Resource sources additionally receive authoritative initial in-use state. The
client retains only resource in-use snapshots and delivers a state-shaped
`{ resourceId, inUse, timestamp? }` payload to each late local consumer. The
resource ID comes from the envelope; historical event names and usage data are
not replayed. Health-only packets preserve the snapshot. Pending initial reads
are shared; joining after a rejection requests a batched renewal on the same
stream. Replay checks consumer, entry and transport ownership and is suppressed
if live in-use state already reached the consumer. Same-batch remounts can reuse a
snapshot; genuine removal, rejection, interruption/recovery and authentication
replacement clear it. Other topics have no local replay. Delayed server initial
results cannot override a newer in-use event or deliver after disconnect.
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
transport before its HTTP request. Every successful explicit login creates a new
provider/client authentication context, including another login by the same user.
The former client's expiry and recovery callbacks cannot affect its replacement.
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
Zod schemas validate the control body and each registered subscription shape;
individual invalid topics are rejected without interrupting the rest of the set.
Duplicate topic ownership fails startup, with no partially applied registration.
User identity always comes from the authenticated session passed to `source`.

Providers own domain authorization and sources. The optional `authorize` hook
receives all subscriptions owned by that provider once per set/lease renewal and
returns rejection reasons keyed by `liveSubscriptionKey`. An omitted hook uses
the endpoint's session authentication. A failed provider rejects its own topics
while other providers continue. `ResourceLiveTopicsProvider` owns both resource
and flow-log topics, keeping resource existence validation in one shared query
and rechecking flow-log permissions on every renewal.

Authorization-map reasons are intentional public business messages (for example
`Forbidden` or `Resource not found`); providers must keep secrets out of them.
Unexpected authorization exceptions, synchronous/asynchronous source-creation
exceptions and observable errors expose only `Topic unavailable`, including
arbitrary `Error`, `HttpException` and non-Error throws. Only the registry's own
subscription-validation exceptions expose its fixed validation reasons.

`source` returns an Observable (or a promise of one) wrapping the existing
producer. Allocate subjects lazily and release them on RxJS finalization.
The optional `setPresence` hook receives visibility controls for active topics
and `false` when a topic ends, is removed/revoked, or its connection disconnects.
`NotificationLiveTopicsProvider` owns web presence; `MessagingLiveTopicsProvider`
retains the producer's subscription-based online presence.

See the adapters in `billing`, `messaging`, `notifications`, `resources` and
`resources/supervision` for examples. New core topics still require updating the
shared `LiveSubscription` type and frontend payload types.

## Plugin live updates

Backend plugins register during `onModuleInit` through the SDK's
`context.liveUpdates.register` facade. This capability is optional in the SDK
type for older hosts. Plugins that require it must declare a compatible host
version and check for it during initialization. No host-provider resolution
permission is needed: registration can only claim this plugin's namespace.

```ts
context.liveUpdates.register({
  topic: 'status',
  identifier: 'required', // 'none' and 'optional' are also supported
  authorize: async ({ identifier }, user) => {
    // Required; throw for invalid identifiers, missing entities or denied access.
    // Revalidated on every subscription set and lease renewal.
    if (!user.effectivePermissions?.has('resources.update')) throw new Error('Forbidden');
    await validateDevice(identifier);
  },
  source: ({ identifier }, user) => deviceUpdates(identifier, user.id),
});
```

The source is an RxJS `Observable<{ data: object }>`; `data.eventType` (or
`data.type`) supplies the envelope's event type. It should allocate lazily and
stop work when unsubscribed. Registration returns an idempotent unregister
function that completes active sources. The host also removes a plugin's
registrations at module teardown. Duplicate ownership fails; other plugins and
core subscriptions continue independently. Authorization and source errors are redacted.
User-specific sources must derive identity from the supplied authenticated user.

The wire topic is `plugin:<encoded manifest name>:<local topic>`, with an optional
string `identifier` (1–128 characters), never a caller-supplied user ID. Local
topic names match `[a-z][a-z0-9-]{0,63}`. Plugins validate the meaning of their
identifiers in `authorize`. Resource fields and unexpected fields are rejected.
Plugins do not need changes to the core topic/payload types.

Frontend plugins import `usePluginLiveUpdates<T>` from the frontend SDK:

```tsx
usePluginLiveUpdates<DeviceStatus>({
  plugin: 'my-plugin', // backend manifest name
  topic: 'status',
  identifier: String(deviceId),
  enabled: isOpen,
  onUpdate: (status) => updateStatus(status),
  // Optional: refresh local state that is not stored in React Query.
  onReconnect: () => refreshLocalStatus(),
});
```

The hook shares the authenticated host client, reference counts identical topics,
supports idempotent `abort`/unmount, and uses the latest callbacks without
resubscribing. A realm-wide React context bridges independently bundled SDK
copies in federation remotes; it contains no transport or global credential.
Logout and session replacement use the same host lifecycle as core consumers.
The host alone invalidates React Query state on reconnect, including plugin
queries. Plugins do not need their own query invalidation callback.

Plugins that sample status can import `createSharedLiveSampler` from the backend
SDK. Create one sampler per service, then call it with a key, interval in
milliseconds and an asynchronous read function. It shares reads for that key,
replays the latest sample to new subscribers, skips overlapping reads and
releases its source, replay buffer and timers when the final subscriber leaves.
A per-key in-flight guard survives teardown until an uncancellable read actually
settles. A recreated source skips that key while busy, then samples afresh on an
eligible tick; abandoned results/errors are never delivered to its consumers.
Other keys remain independent. Reads emit
`{ data: { eventType: 'snapshot', value } }`; failures emit
`{ data: { eventType: 'unavailable' } }` without exposing device errors.

WAGO controller lists, commissioning sessions/verification, diagnostics,
configuration baseline/revisions, runtime/managed-access and network-change
status now receive snapshots through these topics. Shelly firmware progress also
uses the shared stream. Initial reads and mutations remain REST. Since these
device/status services have no push completion signal, backend adapters sample
them at their existing intervals (diagnostics use the front panel's two seconds),
sharing one sampler per active topic/identifier across tabs and stopping it when
the last subscriber leaves. Slow reads do not overlap; transient failures allow
later recovery. WAGO preserves the REST routes' permission requirements.
Unavailable samples retain the last cached snapshot and mark its query as errored
so the UI shows that status is unavailable. They do not trigger a REST read in
each browser. A later shared snapshot clears the error and restores success.
Shelly firmware credentials remain server-side for at most five minutes after an
update command and are never serialized in events or subscription controls. Its
frontend timeout still ends progress when the device or connection is offline.
