# WAGO administration audit integration

The WAGO HTTP controller and locked configuration services emit allowlisted audit lifecycles through
`PluginContext.audit`. The host binds plugin identity from its loaded manifest.
The controller obtains user identity from the guard-authenticated `request.user`
using `wagoAuditPrincipal`; request bodies, JWT values and credentials are never
used as principal metadata.

## Storage dependency

This checkout does **not** contain the generic audit storage foundation
(ATT-906 / ATT-917). Existing authentication logging and password-policy audit
storage are specialized and are not repurposed for WAGO. No durable WAGO audit
history is claimed until the foundation registers a host provider under
`PLUGIN_AUDIT_HOST_PROVIDER` (`Symbol.for('attraccess.plugin.auditHostProvider')`).

The exported `PluginAuditHostProvider.record` contract is:

```ts
record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt>;
// PluginAuditReceipt = { status: 'recorded' } | { status: 'unavailable' }
```

Return `recorded` only after durable acceptance. The storage owner must assign a
server timestamp, enforce retention/access controls, and preserve the principal,
controller subject, operation ID and revision/profile references. The host bridge
overrides any caller-supplied plugin ID. It returns `unavailable` on missing
providers, storage exceptions or a one-second provider deadline; it never serializes errors as fallback records.
WAGO emits only the fixed warning `WAGO audit storage unavailable` in this case.
Timed-out calls are not retried; a late provider response cannot change the domain result.
Domain operations continue; this is explicitly best-effort capture, not a durable
outbox or transactional audit guarantee. Upgrade the host SDK before deploying a
plugin expecting this bridge. Older contexts without `audit` remain supported.

## Wired HTTP lifecycles

| Route | Action | Success boundary |
| --- | --- | --- |
| `POST controllers/:id/claim` | `wago.claim` | Existing `claim` service resolves after credential dispatch; does not assert controller acknowledgement. |
| `DELETE controllers/:id` | `wago.unclaim` | Existing `remove` resolves after revocation/removal. Later commissioning-history cleanup failure does not erase successful unclaim. |
| `POST controllers/:id/configuration/publish` | `wago.publication` | Existing publication resolves; completion includes returned `revision`. Does not assert controller application. |
| `POST controllers/:id/configuration/rollback/:revision` | `wago.rollback` | Publication resolves; includes requested `sourceRevision` and newly returned `revision`. |

Each operation records `attempted` followed by `succeeded` or `failed`, sharing
one generated UUID operation ID. A service rejection is rethrown unchanged to the
caller; its message, stack, response body and payload never enter audit details.
An attempt has no invented revision when the service has not allocated one yet.
Failures after partial service mutations cannot report an allocated revision if
the current service throws without returning it; service owners must supply that
link at the actual mutation boundary.

## Reusable integration contract for remaining owners

`apps/plugins/wago/backend/wago-audit.ts` exports `WagoAudit`, lifecycle/result
interfaces and safe summary/projection functions. No other-owner service needs
to import core audit implementation details.

```ts
const audit = new WagoAudit(context);
const principal = wagoAuditPrincipal(request); // authenticated request only
const result = await audit.run(
  principal, controllerId, 'forced_publication', {},
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

| Operation owner | Action and required integration data |
| --- | --- |
| Commissioning automatic claim | Call `claim` lifecycle around the actual automatic claim, carrying the authenticated initiating principal through the session/job. The existing service-internal call bypasses the HTTP claim hook. Never synthesize an actor from controller data. |
| Credential rotation/manual enrollment | `credential_rotation` / `manual_credential_fallback`; begin with persisted controller ID and authenticated principal, finish only after actual rotation/fallback completion. A `Promise<void>` operation needs no completion projector. Never pass provisioned credentials or manual instructions. |
| Forced publication | `forced_publication`; operation returns `WagoRevisionAuditResult` (`{ revision: number }`). |
| Rejection acknowledgement | `rejection_acknowledgement`; begin with `{ revision }`, finish when the operator acknowledgement is persisted. This is an authenticated operator action, not a raw MQTT rejection/telemetry callback. |
| Preset apply/reapply | Select `preset_application` or `preset_reapplication` from actual persisted provenance under the configuration lock. Return `WagoPresetAuditResult` (`presetId`, `channelId`, `before`, `after`) and project those fields. |
| Hardware Profile create/change | `profile_creation` / `profile_change`; return `WagoProfileAuditResult` (`profileId: string`, `profileVersion: number`, `before`, `after`). Capture identity from the validated profile embedded in `snapshot.modbus.profiles` at the owning configuration draft/publication persistence boundary, not a separate profile record or a local preview. |
| Manual command | `manual_command`; allocate the real command UUID before `begin`, pass `{ channelId, operation, commandId }`, and finish with a result from `WagoManualCommandAuditResult`. For dispatch-only semantics use `dispatched`; for acknowledgement semantics wait for `acknowledged`, `rejected`, `timeout`, or `transport_failure`. The last three finish as `failed`. Never record command values or broker payloads. |

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
or durable audit storage; the unavailable-sink behavior above still applies.

The composed preset routes implement catalog, preview and persisted application.
Application/reapplication audit selection, summaries and persistence run inside
the configuration lock, with the authenticated HTTP principal. Preview and no-op
applications emit no successful persisted application event. Publication and forced publication select their audit action after review and impact
validation under the configuration lock. Rollback emits one lifecycle with source
and resulting revision. Validated custom Modbus profile creates/changes are audited
at explicit draft persistence. Rotation, rejection acknowledgement and manual-command
HTTP operations remain absent. Flow-node commands are not automatically classified as
manual commands. No automatic claim or asynchronous command-handler wiring was
added to the services owned by other tasks. Those gaps and the missing durable
foundation remain acceptance dependencies for ATT-983.
