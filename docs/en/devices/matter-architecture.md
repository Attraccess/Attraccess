# Matter architecture

Matter is an installable backend plugin plus a separate Node.js sidecar. Attraccess core owns plugin loading. The plugin will own host integration; the sidecar will own Matter protocol/device work. A sidecar crash must not stop core or unrelated plugins.

This foundation installs a plugin module with no controllers, permissions, migrations, frontend or background connections. The sidecar initializes the pinned official matter.js Node platform and native crypto, without creating a fabric, opening a radio/device connection or initializing storage. Commissioning, inventory, commands, subscriptions, Thread and OTA are **not operational yet**. Their request, response and event shapes are defined for future implementations; valid requests currently return `501 UNSUPPORTED_CAPABILITY`. Inventory does not return an empty authoritative snapshot.

## Releases and boundaries

There is exactly one wire format: version `1`. Supported releases are:

| Attraccess | Matter plugin | Matter sidecar | matter.js |
| ---------- | ------------- | -------------- | --------- |
| 1.10.0     | 0.1.0         | 0.1.0          | 0.17.9    |

Matching wire versions alone is insufficient. The sidecar checks the host and plugin release headers against its own release. Unknown/malformed releases are rejected before an operation or WebSocket upgrade. The plugin package declares an exact host version, which the existing plugin loader checks independently. Upgrade or downgrade components to this tuple. There are no migrations, previous-version schemas, conversions or compatibility fallbacks.

`libs/matter-contract/package.json` holds the authoritative release policy. Build checks verify the root host package, plugin manifests, sidecar package and pinned dependencies against it. Release updates must update these declarations together. The portable contract library has the public SDK tag; plugin code may depend on this library and public SDKs, never core internals. matter.js imports stay in the sidecar, and contract validation is bundled into the plugin artifact.

The accepted architecture and single-format policy supersede older built-in/previous-version wording in ATT-70 and related tickets. Those descriptions may still be stale; this task does not update sibling tickets.

## Contract and capability discovery

`libs/matter-contract/src/` is the executable source for runtime validation and inferred TypeScript types. Fabric/node IDs and event numbers use exactly 16 lowercase hexadecimal characters, preserving 64 bits. Endpoints, clusters, attributes and commands use bounded integer addresses. Operations carry UUID operation/cancellation IDs and UTC millisecond deadlines. Requests, responses and application events are strict objects.

Operational REST routes are under `/v1`; the event socket is `/v1/events`. Each operational request and WebSocket upgrade requires:

| Header                    | Value                        |
| ------------------------- | ---------------------------- |
| `x-matter-wire-version`   | `1`                          |
| `x-attraccess-version`    | `1.10.0`                     |
| `x-matter-plugin-version` | `0.1.0`                      |
| `x-request-id`            | UUID for request correlation |

These headers describe compatibility; they are **not authentication**. Diagnostics remain readable without them. Browser `Origin` requests/upgrades are rejected, including diagnostics. There is no CORS permission or public proxy. The service binds to loopback only. Local restrictions do not replace service authentication; do not expose it remotely. Future browsers will communicate through the host/plugin or an authenticated proxy.

`GET /v1/capabilities` distinguishes known contract support (`contractSupported: true`) from operational availability (`available: false` with a reason). Fabric, commissioning, inventory, commands, subscriptions, Thread and OTA all start unavailable. Capability discovery never overrides release compatibility.

The route registry declares fabric metadata/lifecycle, commissioning start/status/cancel, authoritative inventory snapshots, typed commands, subscription create/status/cancel and reports, Thread status/dataset operations, and approved OTA requests/progress. Generate the complete route/schema reference with `pnpm nx run matter-contract:export-contract`. OpenAPI 3.1 and JSON Schema files appear in ignored `dist/contracts/matter/`; generated schemas and clients are not committed. `matter-contract:validate-artifacts` checks references and examples against emitted schemas.

Errors use `schemaVersion: 1`, code, safe message, request/operation correlation, retryability and typed safe details. HTTP mappings are validation `400`, wire mismatch `426`, release mismatch `409`, unavailable service `503`, unavailable capability `501`, timeout `504`, reconciliation required `409`, browser Origin `403`, unknown route `404`, payload limit `413` and internal error `500`. An unsupported `/vN` never falls back to `/v1`.

## Events, resume and reconciliation

Every application event has a stable UUID `eventId`, literal `schemaVersion: 1`, UTC timestamp, typed event/payload, nullable initiating request/operation IDs, UUID `streamInstanceId` and increasing safe integer sequence. Autonomous events explicitly carry null correlation. Ping/pong frames are transport frames, not application events. Initial lifecycle and capability events use the same envelope.

After upgrading, send one `ClientMessage` within 10 seconds:

```json
{ "schemaVersion": 1, "type": "resume", "requestId": "00000000-0000-4000-8000-000000000001", "cursor": null }
```

A null cursor starts fresh at the current watermark; it makes no assertion about device state. A retained cursor is `{ "streamInstanceId": "UUID", "sequence": 42 }`, identifying the last processed sequence. Subsequent retained events replay in order, followed by `stream.ready` with a watermark, then live events. Replay and live subscription join atomically. Replayed IDs, timestamps, sequence and correlation are unchanged. Send only one resume message per connection; reconnect to resume again. Every received message is validated, including version checks after subscription.

The in-memory buffer keeps at most 1,000 events for five minutes. Reconnect delivery is at least once: consumers must suppress duplicates by event ID. Ordering holds within one stream instance, never across restarts. Malformed, expired, evicted, future or different-instance cursors return `RECONCILIATION_REQUIRED` and close with code `4009`. Queue overflow also closes with `4009`; a saturated connection may receive only the actionable close reason. Default outgoing queue limit is 1 MiB.

Reconciliation means obtaining an authoritative inventory snapshot containing a stream watermark, then resuming after that watermark. The snapshot schema exists, but snapshots are unavailable in this foundation; the error says `snapshotAvailable: false`. Do not silently advance to the latest event or replay physical commands. A new process uses a new stream ID.

## Physical safety and sensitive data

Requested, accepted, completed, failed and uncertain operation outcomes remain distinct. Accepted does not mean the physical device reported success. A timeout or lost connection can leave a command's outcome uncertain; never automatically retry an ambiguous physical command.

Setup codes, Wi-Fi credentials and Thread datasets are request-only. Normal statuses, events, diagnostics and logs contain no commissioning/fabric secrets or dataset bytes. Validation errors do not echo request bodies or offending values. Feature adapters must emit only the declared public report values and must not place secrets in labels or text reports.

## Next slices

- [ATT-1001](https://linear.app/attraccess/issue/ATT-1001): authenticated plugin client, TLS/proxy support, reconnecting consumer, cancellation and duplicate suppression.
- [ATT-1000](https://linear.app/attraccess/issue/ATT-1000): production images/manifests, deployment storage/secrets and integration with `pnpm serve`.
- [ATT-998](https://linear.app/attraccess/issue/ATT-998): fabric persistence, encrypted backup/restore and recovery.
- Later tickets: commissioning/device features, Thread/OTBR, OTA, permissions/audit, flows and administration UI.

[Operator instructions](devices/matter-operations.md)
