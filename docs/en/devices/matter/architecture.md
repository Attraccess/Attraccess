# Matter: Architecture

> **Groundwork only.** This release lays the foundation for Matter support: a versioned contract, a standalone sidecar with health, version and event-stream endpoints, and a minimal installable plugin. It does **not** commission devices, list devices, send commands, manage Thread or install firmware updates. Do not plan equipment control around it. Those features follow in later tickets (see [What comes later](#what-comes-later)).

## Plugin plus sidecar

Matter ships as two cooperating parts, not as built-in Attraccess code:

- **The Matter plugin** (`apps/plugins/matter`) is an installable Attraccess plugin. In this release it is backend-only and empty: no routes, no permissions, no database migrations, no frontend and **no connection to the sidecar**.
- **The Matter sidecar** (`apps/matter-sidecar`) is a separate Node.js process. It is the only code that loads [matter.js](https://github.com/project-chip/matter.js) (`@matter/main`, pinned to one exact release). It can start and run without the Attraccess API, a database, a Matter fabric or any commissioned device.

A shared library, `libs/matter-contract`, defines every request, response and event once, with runtime validation (Zod). The sidecar and the plugin both use it. It never imports matter.js, core code, database entities or plugins.

Because the sidecar is a separate process, a sidecar crash, restart or version problem cannot terminate Attraccess. If Attraccess rejects the plugin (for example on a host version mismatch), core and other plugins keep running.

## One wire version, strict release combinations

There is exactly **one** wire-protocol version: `1`. There are no previous-version schemas, migrations, translation layers or fallback negotiation. A request or WebSocket upgrade with a missing, malformed or unsupported wire version is rejected before any handler runs.

A matching wire version is not enough. Attraccess, the Matter plugin and the sidecar must form a **supported combination**. The single authoritative table is `COMPATIBILITY_TABLE` in `libs/matter-contract/src/compatibility.ts`:

| Component | Supported |
| --- | --- |
| Wire version | `1` |
| Attraccess | `^1.11.0` (prereleases of a matching version are accepted) |
| Matter plugin | exactly `0.1.0-alpha.0` |
| Matter sidecar | exactly `0.1.0-alpha.0` |
| matter.js | exactly `0.18.0` (plugin and sidecar share one release) |

The plugin's `attraccess.host` (`package.json`) and `attraccessVersion.min` (`plugin.json`) are derived from the same table, and a test checks that they match. Every new plugin or sidecar release needs a table update; otherwise the sidecar rejects it. The Attraccess range is deliberately a range, so a new Attraccess 1.x release does not by itself require a sidecar release.

Release headers are compatibility information, **not authentication**.

## Versioned REST and WebSocket contract

The contract covers eight feature families: `health`, `fabric`, `commissioning`, `inventory`, `commands`, `subscriptions`, `thread` and `ota`. Operations for families that are not implemented yet are still defined and validate their input, so later tickets only fill in behavior.

Unversioned endpoints (`/health/live`, `/health/ready`, `/version`) need no headers, so operators can troubleshoot. Everything under `/v1/` needs these headers:

| Header | Meaning |
| --- | --- |
| `X-Matter-Wire-Version` | `1` |
| `X-Attraccess-Version` | the running Attraccess release |
| `X-Matter-Plugin-Version` | the plugin release |
| `X-Matter-Sidecar-Version` | the sidecar release the caller expects |

Optional: `X-Correlation-Id` (a UUID; one is generated otherwise) and `X-Request-Deadline-Ms`. Unknown versioned paths (for example `/v2/...`) return 404 and never fall through to `/v1`.

Identifiers that Matter defines as 64-bit (node and fabric IDs) travel as decimal strings. matter.js objects never cross the wire.

## Errors and capabilities

Every error uses one envelope: `{ "error": { "code", "message", "correlationId", "retryable", "outcome"?, "details"? } }`.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `validation_failed` | 400 | Invalid path parameters, body or WebSocket message |
| `forbidden_origin` | 403 | Browser `Origin` or non-loopback `Host` |
| `not_found` / `method_not_allowed` | 404 / 405 | Unknown path or method |
| `incompatible_release` | 409 | Unsupported release combination |
| `reconciliation_required` | 409 | Replay impossible (see below) |
| `payload_too_large` | 413 | Body over the limit |
| `unsupported_wire_version` | 426 | Wire version missing, malformed or not `1` |
| `internal_error` | 500 | Unexpected failure; no internal text is returned |
| `unsupported_capability` | 501 | The family is defined but not available |
| `sidecar_unavailable` | 503 | The sidecar is shutting down, or (WebSocket only) 64 event stream clients are already connected |
| `timeout` | 504 | The request deadline passed |

`GET /v1/capabilities` lists each family with `defined`, `available` and, when unavailable, a `reason`. In this release only `health` is available. A request for an unavailable family is validated and then answered with `unsupported_capability`. Placeholders never fake success: no fake commissioning, no empty inventory presented as authoritative, no fake completed command.

**Timeouts and physical commands.** Requested, accepted and reported outcomes are distinct values. When a request for a physical operation times out, the result is reported as `uncertain` with `retryable: false`. An ambiguous physical command is never retried automatically.

## Events, ordering, replay and duplicates

Every event carries an event ID, schema version, timestamp, correlation context, stream instance ID and sequence number. Events the sidecar raises itself carry a correlation context with empty initiator fields. Initial lifecycle and capability events use the same envelope as future feature events.

- **Ordering** is guaranteed only within one sidecar run (one stream instance ID). Ordering across restarts is not promised.
- **Delivery is at least once.** Consumers must drop duplicates by event ID.
- **Resume.** A client connects to `/v1/events` (WebSocket), receives `hello` with the stream instance ID and head cursor, then sends `resume` with an optional cursor. The server replays everything after the cursor and continues live with no gap and no duplicate.
- **Reconciliation.** If the cursor is malformed, expired, evicted, in the future or from an earlier sidecar run, the server sends `reconciliation-required` with `"snapshot": "unavailable"` and closes the connection. This foundation has no snapshot to offer and never fabricates one.
- **Bounds.** Replay is bounded in memory by count (default 1,000 events) and age (default 5 minutes); idle events expire too.
- **Client limit.** At most 64 WebSocket clients may be connected at once. A further upgrade is refused with 503 `sidecar_unavailable`. The version check comes first, so a client with a wrong version always gets 409 or 426, even when the limit is reached.
- **First-message timeout.** A client that does not send `resume` within 30 seconds of connecting is closed with code 1008. A `ping` does not count: only `resume` stops the timer.
- **Slow clients.** Each client has a queue budget that also counts error messages. A client that exceeds it is closed with code 1013 and told to reconnect with its last cursor.
- **Oversized messages.** The WebSocket parser closes them with code 1009 (message too big) before application code sees them.

## Security boundaries

- The sidecar binds to **loopback only** (`127.0.0.1`). There is no remote bind option.
- It rejects any request or upgrade with a browser `Origin` header or a non-loopback `Host`, and offers no CORS. Browsers talk to Attraccess, never to the sidecar.
- It does **not authenticate callers yet**. Any local process can reach it. Service authentication, TLS and proxy support arrive with [ATT-1001](https://linear.app/attraccess/issue/ATT-1001). **Do not expose the sidecar remotely.**
- Commissioning secrets (setup codes), Thread dataset material and fabric secrets appear only in requests, never in responses, events, health output or logs.
- A generic Matter "On" cannot authorize operating a machine. Unlock, unbolt or power-on of equipment will require a dedicated permission plus explicit confirmation. Enforcement belongs to the later feature tickets.

## Generated contract documents

`pnpm nx run matter-contract:export-contracts` writes OpenAPI 3.1 and JSON Schema documents to `dist/contracts/matter/` (`openapi.json`, `json-schema.json`). The output is deterministic, ignored by Git and never committed. `pnpm nx run matter-contract:test-artifacts` validates them with example payloads.

## What comes later

- [ATT-1001](https://linear.app/attraccess/issue/ATT-1001): plugin-to-sidecar client, authentication, TLS, reconnecting consumer.
- [ATT-1000](https://linear.app/attraccess/issue/ATT-1000): production packaging and deployment.
- [ATT-998](https://linear.app/attraccess/issue/ATT-998): fabric persistence, encrypted backup and recovery.
- Later Matter feature tickets: commissioning, device inventory, commands, subscriptions, Thread, OTA, permissions and audit. Defining their contract shapes here does not deliver those features.

See also the [operator guide](operator.md).
