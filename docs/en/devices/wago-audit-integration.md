# WAGO administration audit integration

The WAGO HTTP controller emits allowlisted audit lifecycles through
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
providers or storage exceptions; it never serializes errors as fallback records.
WAGO emits only the fixed warning `WAGO audit storage unavailable` in this case.
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
| Hardware Profile create/change | `profile_creation` / `profile_change`; return `WagoProfileAuditResult` (`profileId`, `profileVersion`, `before`, `after`). IDs refer to persisted profiles and positive integer versions. No profile persistence operation exists in this checkout. |
| Manual command | `manual_command`; allocate the real command UUID before `begin`, pass `{ channelId, operation, commandId }`, and finish with a result from `WagoManualCommandAuditResult`. For dispatch-only semantics use `dispatched`; for acknowledgement semantics wait for `acknowledged`, `rejected`, `timeout`, or `transport_failure`. The last three finish as `failed`. Never record command values or broker payloads. |

`before` and `after` use `WagoAuditSummary`: only `physicalPointCount` and
`logicalChannelCount`. Compute both within the owner’s mutation lock from the
actual persisted snapshots using `wagoAuditSummary`; no separate preflight reads
that could race another write. These intentionally minimal summaries exclude
configuration values. Preset identity is restricted to the catalog, channel IDs
to 1–64 ASCII letters/digits/underscore/hyphen, command IDs to UUID syntax, and
operations/results to explicit enums. Revisions, profile IDs and versions must
be positive safe integers. Extra keys at every level are dropped. IDs must come
from validated domain identities, never arbitrary request text or error strings.

Currently the preset routes call missing `presets`, `previewPreset` and
`applyPreset` service methods. This integration does not claim those routes work
or modify their owner's implementation. Rotation, forced publication, rejection
acknowledgement, Hardware Profile CRUD and manual-command HTTP operations are
also not present here. Flow-node commands are not automatically classified as
manual commands. No automatic claim or asynchronous command-handler wiring was
added to the services owned by other tasks. Those gaps and the missing durable
foundation remain acceptance dependencies for ATT-983.
