# WAGO administration audit integration

The WAGO HTTP controller and locked configuration services emit allowlisted audit lifecycles through
`PluginContext.audit`. The host binds plugin identity from its loaded manifest.
The controller obtains user identity from the guard-authenticated `request.user`
using `wagoAuditPrincipal`; request bodies, JWT values and credentials are never
used as principal metadata.

## Durable storage

The core `AuditModule` registers `AuditService` under
`PLUGIN_AUDIT_HOST_PROVIDER` (`Symbol.for('attraccess.plugin.auditHostProvider')`).
It writes the shared `audit_log` table through the existing SDK bridge, not a
WAGO-owned table or commissioning progress log. Existing authentication logging
and password-policy audit storage remain separate; this does not implement every
domain or the full admin UI from ATT-906 / ATT-917 / ATT-235.

The exported `PluginAuditHostProvider.record` contract is:

```ts
record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt>;
// PluginAuditReceipt = { status: 'recorded' } | { status: 'unavailable' }
```

`recorded` means a completed autocommitted insert on a separate connection to the
host SQLite file with `synchronous=FULL`. Rows have server timestamps, actor and
API-token IDs, plugin identity, operation UUID, outcome, subject and safe details.
Historical identifiers have no cascading foreign keys: deleting a controller,
principal, token or plugin does not delete its history. A database trigger rejects
row updates; retention is the intentional deletion path. The host bridge
overrides any caller-supplied plugin ID. It returns `unavailable` on missing
providers, storage exceptions or a one-second provider deadline; it never serializes errors as fallback records.
WAGO emits only the fixed warning `WAGO audit storage unavailable` in this case.
Timed-out calls are not retried; a late provider response cannot change the domain result.
Domain operations continue; this is explicitly best-effort capture, not a durable
outbox or transactional audit guarantee. Calls during an active host transaction
return `unavailable` rather than falsely acknowledging a savepoint that might roll
back. Call at the committed operation boundary when transaction-scoped capture is
required. The provider bounds outstanding writes and does not enqueue or retry
rejected work. `:memory:` sources cannot support a separate durable connection and
remain unavailable; persistence tests use isolated on-disk SQLite fixtures.
Upgrade the host SDK before deploying a
plugin expecting this bridge. Older contexts without `audit` remain supported.

### Migration and query contract

Core migration `DurableAudit1783700000000` creates `audit_log`, its query indexes,
the immutable-row trigger and `system.audit.read`. The permission is granted only
to the built-in administrator role on upgrade. Existing roles, controller data and
specialized audit tables are left intact. The normal host migration runner applies
it before module startup; no runtime schema synchronization is used. Its `down`
migration removes the audit table/history and its permission, so export or retain
the database before an intentional downgrade that needs this history.

`GET /api/admin/audit-log` requires `system.audit.read`. Session permissions and
API-token permission ceilings use the existing authentication/RBAC guards; having
`system.settings.manage` alone does not grant access to audit history.

The response is `{ items: AuditLog[], nextCursor: number | null }`. Rows are ordered
by descending row ID. Send `beforeId=nextCursor` for the next page. `limit` defaults
to 50 and is bounded to 1..100; invalid or unknown query fields are rejected.
Supported filters are `domain=wago`, exact `action`, `eventPrefix` (for example
`wago.commissioning.`), `outcome`, `operationId`, `actorId`, `subjectType`,
`subjectId`, and inclusive ISO timestamp bounds `from`/`to`. Subject types are
`wago.controller` and `wago.commissioning`. Dates are returned as ISO timestamps.
Rows retain identifiers and explicitly safe metadata, not actor names, command
values, credential values, arbitrary error strings or raw configuration snapshots.

`GET /api/settings/audit` and `PATCH /api/settings/audit` require the existing
`system.settings.manage` permission. Settings use `SettingsStoreService` with
parent `audit` and the following JSON-encoded keys:

| Key              | Default    | Bounds                                                   |
| ---------------- | ---------- | -------------------------------------------------------- |
| `enabled`        | `true`     | Boolean master switch.                                   |
| `domains`        | `["wago"]` | All currently registered domains; `[]` disables capture. |
| `retention_days` | `90`       | Integer 1..3650.                                         |

PATCH accepts these fields, for example `{ "retention_days": 30 }`. Invalid
persisted settings fail closed rather than silently enabling capture or purging
with an invented retention period. Writes read settings before storage submission;
the existing settings cache is updated by local PATCH calls and can take up to one
minute to refresh on another process. No environment-only second settings store
is introduced.

The sink admits at most eight outstanding writes and retains no retry queue.
Details are bounded to 4 KiB and validated against per-action allowlists. Caller
objects are snapshotted once from data properties; accessors, custom prototypes,
unknown fields and unsupported events are rejected before persistence. Extending
the generic store to another domain requires an explicit reviewed event policy,
not permission to submit arbitrary JSON. In particular, telemetry events are not
accepted.

Retention runs at startup and hourly, deleting expired rows in batches of 1,000
and yielding between batches until the backlog is drained. Only deletion counts
are logged. Expired rows are excluded from queries immediately, including when a
cleanup attempt fails. Disabling capture does not disable retention or erase
currently retained history.

## Wired HTTP lifecycles

| Route                                                   | Action                                         | Success boundary                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST controllers/:id/claim`                            | `wago.claim`                                   | Existing `claim` service resolves after credential dispatch; does not assert controller acknowledgement.                                                                                   |
| `DELETE controllers/:id`                                | `wago.unclaim`                                 | Existing `remove` resolves after revocation/removal. Later commissioning-history cleanup failure does not erase successful unclaim.                                                        |
| `POST controllers/:id/configuration/publish`            | `wago.publication` / `wago.forced_publication` | Publication dispatch resolves; completion includes the allocated or reused `revision`. Forced publication uses the same locked admission boundary. Does not assert controller application. |
| `POST controllers/:id/configuration/rollback/:revision` | `wago.rollback`                                | Publication resolves; includes requested `sourceRevision` and resulting `revision`. No nested publication lifecycle.                                                                       |
| `POST controllers/:id/credentials/manual/complete`      | `wago.manual_credential_fallback`              | A matching expiring claim acknowledgement is received while the operation still owns its guard.                                                                                            |
| `POST controllers/:id/commands`                         | `wago.manual_command`                          | The real command UUID is acknowledged; rejected, timed-out, transport-failed and shutdown outcomes finish as failed.                                                                       |

Each operation records `attempted` followed by `succeeded` or `failed`, sharing
one generated UUID operation ID. A service rejection is rethrown unchanged to the
caller; its message, stack, response body and payload never enter audit details.
An attempt has no invented revision when the service has not allocated one yet.
Publication and rollback record the allocated or reused revision at the dispatch
boundary. A subsequent dispatch or persistence failure includes that revision in
the failed completion; rollback also retains `sourceRevision`. Failures before
allocation have no invented revision.

## Reusable integration contract for remaining owners

`apps/plugins/wago/backend/wago-audit.ts` exports `WagoAudit`, lifecycle/result
interfaces and safe summary/projection functions. No other-owner service needs
to import core audit implementation details.

```ts
const audit = new WagoAudit(context);
const principal = wagoAuditPrincipal(request); // authenticated request only
const result = await audit.run(
  principal,
  controllerId,
  'forced_publication',
  {},
  () => serviceOperation(), // Promise<WagoRevisionAuditResult>
  (value) => ({ revision: value.revision }),
);
```

`run<T>` returns the **exact original service value** as `Promise<T>` and rethrows
the original service error. Its completion projector returns only
`WagoAuditDetails`. It does not add audit receipts to existing HTTP responses.

For dispatch/acknowledgement workflows use `begin`, which returns
`WagoAuditLifecycle`: `operationId: string`,
`attempt(): Promise<PluginAuditReceipt>`, and
`finish('succeeded' | 'failed', details?): Promise<PluginAuditReceipt>`.
Repeated attempt/finish calls on the same handle emit at most one attempt and
one terminal event; the first terminal call wins. Finishing implicitly awaits
the attempt. The handle is process-local, not persisted correlation state.

| Operation owner                       | Action and required integration data                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commissioning automatic claim         | Call `claim` lifecycle around the actual automatic claim, carrying the authenticated initiating principal through the session/job. The existing service-internal call bypasses the HTTP claim hook. Never synthesize an actor from controller data.                                                                                                                                                               |
| Credential rotation/manual enrollment | `credential_rotation` / `manual_credential_fallback`; begin with persisted controller ID and authenticated principal, finish only after actual rotation/fallback completion. A `Promise<void>` operation needs no completion projector. Never pass provisioned credentials or manual instructions.                                                                                                                |
| Forced publication                    | `forced_publication`; operation returns `WagoRevisionAuditResult` (`{ revision: number }`).                                                                                                                                                                                                                                                                                                                       |
| Rejection acknowledgement             | `rejection_acknowledgement`; begin with `{ revision }`, finish when the operator acknowledgement is persisted. This is an authenticated operator action, not a raw MQTT rejection/telemetry callback.                                                                                                                                                                                                             |
| Preset apply/reapply                  | Select `preset_application` or `preset_reapplication` from actual persisted provenance under the configuration lock. Return `WagoPresetAuditResult` (`presetId`, `channelId`, `before`, `after`) and project those fields.                                                                                                                                                                                        |
| Hardware Profile create/change        | `profile_creation` / `profile_change`; return `WagoProfileAuditResult` (`profileId: string`, `profileVersion: number`, `before`, `after`). Capture identity from the validated profile embedded in `snapshot.modbus.profiles` at the owning configuration draft/publication persistence boundary, not a separate profile record or a local preview.                                                               |
| Manual command                        | `manual_command`; allocate the real command UUID before `begin`, pass `{ channelId, operation, commandId }`, and finish with a result from `WagoManualCommandAuditResult`. For dispatch-only semantics use `dispatched`; for acknowledgement semantics wait for `acknowledged`, `rejected`, `timeout`, or `transport_failure`. The last three finish as `failed`. Never record command values or broker payloads. |

`before` and `after` use `WagoAuditSummary`: only `physicalPointCount` and
`logicalChannelCount`. Compute both within the owner’s mutation lock from the
actual persisted snapshots using `wagoAuditSummary`; no separate preflight reads
that could race another write. These intentionally minimal summaries exclude
configuration values. Preset identity is restricted to the catalog, channel IDs
to 1–64 ASCII letters/digits/underscore/hyphen, command IDs to UUID syntax, and
operations/results to explicit enums. Revisions must be positive safe integers.
The profile contract matches ATT-1059 / Modbus commit `20ef1db4`: `profileId` is a
string with a nonempty `trim()` result and original JavaScript `.length` at most
160 (UTF-16 code units); `profileVersion` is a safe integer in `1..1000000`.
Accepted IDs are preserved verbatim, never trimmed, truncated, coerced or
restricted to UUID/ASCII syntax. Built-in references include
`wago-879-3000-unverified` and `wago-879-1300-unverified`, version 1; custom IDs
are user-editable strings. Invalid fields and extra keys at every level are
dropped, not copied into error metadata. The length check is not secret detection:
IDs must come from validated domain identities, never arbitrary request text or
error strings. Full profiles, transport settings, credentials, measurement/action
maps and raw errors must not be supplied as identity fields.

### Locked preset and revision integration

`WagoPresetAuditResult` is exactly `{ presetId, channelId, before, after }`;
`presetId` is a catalog ID and both summaries are `WagoAuditSummary`.
Inside the existing `withConfigurationLock` callback, read persisted provenance,
select `preset_application` versus `preset_reapplication`, and compute `before`
from the locked persisted snapshot. Call `audit.run` inside that same lock with
the authenticated principal, controller ID, selected action and
`{ presetId, channelId, before }`. Its operation callback must persist the
mutation and return `WagoPresetAuditResult`, computing `after` from the actual
saved snapshot before releasing the lock. Project only those four result fields
in the completion callback. Do not nest another configuration lock or select the
action via controller preflight reads. Local preview/apply does not persist and
must not emit successful persisted preset application events.

For `publication` / `forced_publication`, the operation returns
`WagoRevisionAuditResult` (`{ revision: number }`) after publication persistence;
project `{ revision: value.revision }`. Choose the action at the owner's actual
validated publication boundary, and avoid double emission from an existing HTTP
wrapper. For `rollback`, initial details are `{ sourceRevision }` and completion
adds the newly allocated `{ revision }`. For `rejection_acknowledgement`, initial
details are `{ revision }`; success follows persisted operator acknowledgement,
not reception of a device rejection. A `Promise<void>` operation can omit the
completion projector. None of these success events asserts hardware application
or a successful audit receipt; the unavailable-sink behavior above still applies.

The composed preset routes implement catalog, preview and persisted application.
Application/reapplication audit selection, summaries and persistence run inside
the configuration lock, with the authenticated HTTP principal. Preview emits no
successful persisted application event. An explicit editor reapplication can emit
an event even when configuration values are unchanged; a retried save without new
application provenance does not. Publication and forced publication select their audit action after review and impact
validation under the configuration lock. Rollback emits one lifecycle with source
and resulting revision. Validated custom Modbus profile creates/changes are audited
at explicit draft persistence. Rejection acknowledgement emits its lifecycle after
validation under the configuration lock; an already acknowledged revision is a
no-op. Manual fallback and manual-command HTTP operations are also wired, as
described below. Flow-node commands are not classified as manual commands.
Helper tests for action names alone are not evidence of runtime hookup.

### Commissioning stack composition

The composed commissioning stack emits through the same host bridge. Its
`auditCommissioning` helper uses `wago.commissioning` subjects (the persisted
session ID) for `wago.commissioning.install`, `recover`, `security_inspect`,
`security_review`, `security_apply`, `security_recover`, `platform_inspect`,
`platform_activate`, `platform_recover`, and `lease_recover`. Details are empty.
Automatic claim instead emits `wago.claim` against the real `wago.controller` ID.
The authenticated initiating principal is persisted in commissioning sessions;
legacy sessions without a valid initiator must not invent one.

That commissioning stack predates the composed configuration hooks. The integrator
must preserve the integration branch's HTTP claim and locked configuration hooks,
not replace them with the commissioning branch's older controller/service snapshot.
For unclaim, preserve commissioning ownership checks and put the existing audit
wrapper inside its safe-removal callback:

```ts
const principal = wagoAuditPrincipal(request);
await this.commissioning.removeControllerSafely(id, (assertOwned) =>
  this.audit.run(principal, id, 'unclaim', {}, () => this.wago.remove(id, assertOwned)),
);
```

This preserves successful unclaim even if subsequent session cleanup fails. Compose
the commissioning principal migration with its owner stack; do not transplant or
duplicate it in the core audit migration. Automatic claim needs exactly one
lifecycle, not both the commissioning helper and another `WagoAudit` wrapper.

### Manual credential completion

`POST controllers/:id/credentials/manual/complete` requires
`system.settings.manage`, the physical pairing verifier, the deterministic
`wago-controller-<hardwareId>` identity and its externally provisioned password.
It is available only when the broker has no automatic provisioning provider and
the runtime advertises `claim-expiry-v1`. It does not invent an enrollment ID as
the audit subject or treat returned instructions as completed provisioning.

The handoff carries a server-generated 30-second expiry. The operation waits for
the matching acknowledgement and retains ownership assertions across pending
continuations. Success returns `{ controllerId, result: "acknowledged" }` and
records no credential values. Acknowledgement proves the runtime accepted the
handoff; it does not establish hardware qualification. A matching receipt also
prevents permanent credential rollback if the broker's publish receipt later
fails. An uncertain dispatched handoff fails the HTTP operation and audit
lifecycle, and a pinned commissioning session retains its durable recovery lease.
Removal and subsequent commissioning writes remain blocked until explicit
recovery. Timed-out continuations cannot perform later guarded mutations.

### Authenticated manual commands

`POST controllers/:id/commands` requires `resources.update`. Its body accepts
`channelId`, `action` (`set` or `pulse`), `value` for `set`, the
`expectedConfigurationRevision`, and optional `acknowledgementTimeoutSeconds`.
Unknown fields are rejected. Execution validates against the applied configuration,
allocates the actual command UUID before the audit attempt, and waits for bounded
acknowledgement. Acknowledgements for another controller or a completed command
do not change the lifecycle.

The response is `{ commandId, channelId, operation, result }`, where `result` is
`acknowledged`, `rejected`, `timeout`, or `transport_failure`. Only
`acknowledged` finishes as succeeded. Dispatch rejection and shutdown use
`transport_failure`; absent acknowledgements and stalled dispatch use `timeout`.
Audit details contain this bounded identity/result projection, never the command
value, raw acknowledgement, broker payload or transport error. Automatic flow
commands continue through their existing execution path without manual audit
events.

### Fixture acceptance and remaining integration

`apps/api/src/audit/wago-hooks.integration.spec.ts` mounts the actual WAGO HTTP
controller with the host authentication and permission guards, real WAGO services,
registered migrations, the SDK bridge and a separate durable SQLite audit
connection. Token validation, runtime artifact acquisition, broker/SSH transport
and credential-provider boundaries use isolated fixtures. It covers automatic claim, reopen persistence,
publication/rollback failure correlation, guarded unclaim, manual-command terminal
results, manual-fallback permission/expiry admission and acknowledgement ordering.
Rotation coverage exercises operational heartbeat admission, permission/confirmation/session
guards, correlated reconnect acknowledgements, a real 30-second dispatch timeout,
original-broker removal, and encrypted pending credentials across database/service reopen.
Recovery uses the mounted operation-recovery API after advancing only fixture lease
timestamps; retry delivers the persisted credential without a second provider mutation.

Credential rotation is exposed through authenticated administration routes requiring
`system.settings.manage`:

- `GET controllers/:id/credentials/rotation` returns only the recovery phase
  (`none`, `provisioning`, `pending`, or `completed`) and its revision when present.
- `POST controllers/:id/credentials/rotate` requires `{ "confirm": true }`.
  `{ "confirm": true, "retry": true }` retries a persisted pending handoff without
  rotating the broker password again. A pinned commissioning session and its
  durable operation lease are required; sessionless rotation is refused.

The owner emits one `wago.credential_rotation` lifecycle through the existing host
bridge. Success follows a matching acknowledgement sent only after the runtime
persists the new credential and reconnects using it. A provider response alone is
not completion. Responses and audit details contain no passwords, recovery tokens
or encrypted credential blobs. The private plugin recovery row persists the
original broker, credential epoch, revision, token and encrypted pending credential.
A provisioning interruption without a persisted credential fails closed and cannot
silently rotate again. Uncertain handoff errors retain the commissioning lease;
explicit operation recovery precedes another attempt.

Rotation messages expire, carry the registration's UUID credential epoch, and use
monotonic revisions within that epoch. Fresh enrollment creates a new epoch; an
old registration's higher revision cannot replace its credentials. Claim and
rotation expiry are checked again at queued persistence. Existing registrations
without an epoch must be safely re-enrolled before rotation. The runtime must
advertise `credential-rotation-v1` through a fresh canonical operational heartbeat;
discovery cannot establish rotation readiness. New rotations require that heartbeat
to be less than 90 seconds old and not in the future. Pending retries remain available
without fresh liveness. Initial provisioning grants its dedicated
`credentials/rotate` subscription. Existing broker identities need that topic ACL
and a reconnect; denied optional rotation subscriptions leave ordinary runtime
startup available and withhold the rotation capability until subscription succeeds.

Explicit controller removal validates the original rotation broker before existing
guarded credential revocation. Deleting the controller then cascades its private
rotation recovery row. Failed revocation preserves the controller and recovery
metadata. Downgrades refuse to discard active credential recovery metadata.

Software fixtures do not establish controller qualification or close the physical
acceptance and release gates.
