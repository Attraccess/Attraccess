# Matter: Architecture
<!-- llms-description: Architecture of the Matter integration: a plugin plus a sidecar, versioned REST and WebSocket contract, errors and events. -->

> **Connectivity only.** This release provides the foundation for Matter support: a versioned contract, a standalone sidecar with health, version and event-stream endpoints, and a plugin that connects to it securely. It does **not** commission devices, list devices, send commands, manage Thread or install firmware updates. Do not plan equipment control around it. Those features follow in later tickets (see [What comes later](#what-comes-later)).

## Plugin plus sidecar

Matter ships as two cooperating parts, not as built-in Attraccess code:

- **The Matter plugin** (`apps/plugins/matter`) is an installable Attraccess plugin. In this release it connects to the sidecar and offers an admin page (**Devices → Matter**) for the connection settings. It has no device features yet. It needs the `DATABASE_ACCESS` and `MANAGE_SECRETS` permissions.
- **The Matter sidecar** (`apps/matter-sidecar`) is a separate Node.js process. It is the only code that loads [matter.js](https://github.com/project-chip/matter.js) (`@matter/main`, pinned to one exact release). It can start and run without the Attraccess API, a database, a Matter fabric or any commissioned device.

A shared library, `libs/matter-contract`, defines every request, response and event once, with runtime validation (Zod). The sidecar and the plugin both use it. It never imports matter.js, core code, database entities or plugins.

Because the sidecar is a separate process, a sidecar crash, restart or version problem cannot terminate Attraccess. If Attraccess rejects the plugin (for example on a host version mismatch), core and other plugins keep running.

## One wire version, strict release combinations

There is exactly **one** wire-protocol version: `1`. There are no previous-version schemas, migrations, translation layers or fallback negotiation. A request or WebSocket upgrade with a missing, malformed or unsupported wire version is rejected before any handler runs.

A matching wire version is not enough. Attraccess, the Matter plugin and the sidecar must form a **supported combination**. The single authoritative table is `COMPATIBILITY_TABLE` in `libs/matter-contract/src/compatibility.ts`:

| Component      | Supported                                                  |
| -------------- | ---------------------------------------------------------- |
| Wire version   | `1`                                                        |
| Attraccess     | `^1.11.0` (prereleases of a matching version are accepted) |
| Matter plugin  | exactly `0.2.0-alpha.0`                                    |
| Matter sidecar | exactly `0.2.0-alpha.0`                                    |
| matter.js      | exactly `0.18.0` (plugin and sidecar share one release)    |

The plugin's `attraccess.host` (`package.json`) and `attraccessVersion.min` (`plugin.json`) are derived from the same table, and a test checks that they match. Every new plugin or sidecar release needs a table update; otherwise the sidecar rejects it. The Attraccess range is deliberately a range, so a new Attraccess 1.x release does not by itself require a sidecar release.

Release headers are compatibility information, **not authentication**; authentication is the service token (see [Security model](#security-model)). A mismatched sidecar must be upgraded or downgraded.

## Versioned REST and WebSocket contract

The contract covers eight feature families: `health`, `fabric`, `commissioning`, `inventory`, `commands`, `subscriptions`, `thread` and `ota`. Operations for families that are not implemented yet are still defined and validate their input, so later tickets only fill in behavior.

Unversioned endpoints (`/health/live`, `/health/ready`, `/version`) need no compatibility headers, so operators can troubleshoot (all but the two health probes still need the token). Everything under `/v1/` needs the token and these headers:

| Header                     | Meaning                                |
| -------------------------- | -------------------------------------- |
| `X-Matter-Wire-Version`    | `1`                                    |
| `X-Attraccess-Version`     | the running Attraccess release         |
| `X-Matter-Plugin-Version`  | the plugin release                     |
| `X-Matter-Sidecar-Version` | the sidecar release the caller expects |

Also: `Authorization: Bearer <token>` (required) and, optionally, `X-Correlation-Id` (a UUID; one is generated otherwise) and `X-Request-Deadline-Ms`, which can only shorten the configured request deadline, never extend it. Unknown versioned paths (for example `/v2/...`) return 404 and never fall through to `/v1`.

Identifiers that Matter defines as 64-bit (node and fabric IDs) travel as decimal strings. matter.js objects never cross the wire.

## Errors and capabilities

Every error uses one envelope: `{ "error": { "code", "message", "correlationId", "retryable", "outcome"?, "details"? } }`.

| Code                               | HTTP      | Meaning                                                                                                        |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `validation_failed`                | 400       | Invalid path parameters or body (for WebSocket messages, see [Events](#events-ordering-replay-and-duplicates)) |
| `unauthorized`                     | 401       | Missing, malformed or wrong service token (checked before any version check)                                   |
| `forbidden_origin`                 | 403       | Browser `Origin`, or a `Host` that is neither loopback nor in `MATTER_SIDECAR_ALLOWED_HOSTS`                   |
| `not_found` / `method_not_allowed` | 404 / 405 | Unknown path or method                                                                                         |
| `incompatible_release`             | 409       | Unsupported release combination                                                                                |
| `reconciliation_required`          | 409       | Reserved; in this release an impossible replay arrives as a WebSocket message (see below)                      |
| `payload_too_large`                | 413       | Body over the limit                                                                                            |
| `unsupported_wire_version`         | 426       | Wire version missing, malformed or not `1`                                                                     |
| `internal_error`                   | 500       | Unexpected failure; no internal text is returned                                                               |
| `unsupported_capability`           | 501       | The family is defined but not available                                                                        |
| `sidecar_unavailable`              | 503       | The sidecar is shutting down, or (WebSocket only) 64 event stream clients are already connected                |
| `timeout`                          | 504       | The request deadline passed                                                                                    |

`GET /v1/capabilities` lists each family with `defined`, `available` and, when unavailable, a `reason`. In this release only `health` is available. A request for an unavailable family is validated and then answered with `unsupported_capability`. Placeholders never fake success: no fake commissioning, no empty inventory presented as authoritative, no fake completed command.

**Timeouts and physical commands.** Requested, accepted and reported outcomes are distinct values. When a request for a physical operation times out, the result is reported as `uncertain` with `retryable: false`. An ambiguous physical command is never retried automatically.

## Events, ordering, replay and duplicates

Every event carries an event ID, schema version, timestamp, correlation context, stream instance ID and sequence number. Events the sidecar raises itself carry a correlation context with empty initiator fields. Initial lifecycle and capability events use the same envelope as future feature events.

- **Ordering** is guaranteed only within one sidecar run (one stream instance ID). Ordering across restarts is not promised.
- **Delivery is at least once.** Consumers must drop duplicates by event ID.
- **Resume.** A client connects to `/v1/events` (WebSocket), receives `hello` with the stream instance ID and head cursor, then sends `{"type":"resume","wireVersion":1}` with an optional `cursor`. The server replays everything after the cursor and continues live with no gap and no duplicate.
- **Reconciliation.** If the cursor is malformed, expired, evicted, in the future or from an earlier sidecar run, the server sends `reconciliation-required` with `"snapshot": "unavailable"` and closes the connection with code 1000. This foundation has no snapshot to offer and never fabricates one.
- **Bounds.** Replay is bounded in memory by count (default 1,000 events) and age (default 5 minutes); idle events expire too.
- **Client limit.** At most 64 WebSocket clients may be connected at once. A further upgrade is refused with 503 `sidecar_unavailable`. The version check comes first, so a client with a wrong version always gets 409 or 426, even when the limit is reached.
- **First-message timeout.** A client that does not send `resume` within 30 seconds of connecting is closed with code 1008. A `ping` (`{"type":"ping","wireVersion":1}`, answered with `pong`) does not count: only `resume` stops the timer.
- **Invalid messages.** A binary, non-JSON or off-contract message, or a second `resume` on the same connection, is answered with an `error` message (`validation_failed`, carrying the upgrade's correlation ID) and the connection is closed with code 1008.
- **Slow clients.** Each client has a queue budget that also counts error messages and the replay sent after `resume`. A client that exceeds it is closed with code 1013 and told to reconnect with its last cursor. Keep the budget larger than the replay a reconnecting client may need.
- **Oversized messages.** The WebSocket parser closes them with code 1009 (message too big) before application code sees them.

## Security model

The sidecar controls physical equipment, so it never trusts a caller by network position alone.

- **Service authentication.** Every request and every WebSocket upgrade must carry `Authorization: Bearer <token>`. The only exceptions are `GET /health/live` and `GET /health/ready`, which stay anonymous for container probes and reveal no versions. `/version`, everything under `/v1/` and the `/v1/events` upgrade need the token (`/version` still needs no compatibility headers).
- **The token** is 32–512 printable ASCII characters (use `openssl rand -base64 48`). It comes from `MATTER_SIDECAR_AUTH_TOKEN` or `MATTER_SIDECAR_AUTH_TOKEN_FILE`; a second, `…_PREVIOUS` token is accepted alongside it while you rotate. Without a token the sidecar refuses to start. Tokens are compared in constant time. A failed authentication is logged at warn level (rate-limited), never with the token or the header.
- **Check order.** The sidecar checks, in this order: (1) `Origin` and `Host` (403), (2) **authentication (401)**, (3) draining (503, for `/v1` and the event stream), (4) wire version and release combination (426 / 409), (5) the WebSocket client cap (503). An unauthenticated caller therefore learns nothing about versions or the compatibility table, not even whether a path exists.
- **Browsers.** A request with a browser `Origin` header is always refused with 403, and the sidecar offers no CORS. Browsers talk to Attraccess, never to the sidecar.
- **Bind address and Host allow-list.** By default the sidecar binds to `127.0.0.1` and accepts only loopback `Host` names. `MATTER_SIDECAR_BIND_HOST` opts into another address; then `MATTER_SIDECAR_ALLOWED_HOSTS` (a comma-separated list of the host names clients use) is required, and any other `Host` is refused with 403.
- **TLS.** `MATTER_SIDECAR_TLS_CERT_FILE` and `MATTER_SIDECAR_TLS_KEY_FILE` (both or neither) make the sidecar serve HTTPS and WSS. A non-loopback bind **without** TLS is refused at startup unless `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true` is set explicitly, which is meant only for a trusted container network or a TLS-terminating reverse proxy; the sidecar logs a warning when it is used. Certificates are read at start-up; renewing them needs a restart. Mutual TLS is not supported.
- Commissioning secrets (setup codes), Thread dataset material and fabric secrets appear only in requests, never in responses, events, health output or logs.
- A generic Matter "On" cannot authorize operating a machine. Unlock, unbolt or power-on of equipment will require a dedicated permission plus explicit confirmation. Enforcement belongs to the later feature tickets.

## The plugin connects to the sidecar

An administrator configures the connection in the web UI (**Devices → Matter**): the sidecar URL, the service token and, optionally, a CA certificate. That CA is added to Node.js's default trust store (the bundled root certificates plus any `NODE_EXTRA_CA_CERTS`); it does not replace it. The URL may be `http` or `https` and may carry a path prefix for a reverse proxy (`https://host/prefix` leads to `/prefix/v1/...`). The token is stored encrypted by the host (`MANAGE_SECRETS`) in a plugin table (`DATABASE_ACCESS`), is never shown again and never appears in logs, errors, status responses or audit entries. Only users with the `system.plugins.manage` permission can read or change the settings (a dedicated Matter permission follows in [ATT-1003](https://linear.app/attraccess/issue/ATT-1003)). Every change is recorded in the audit log without secrets.

The plugin starts the connection without waiting for the sidecar. **A missing, restarting, rejecting or incompatible sidecar never stops Attraccess or the plugin from loading**; the plugin shows an explicit state instead:

| State                        | Meaning                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not_configured`             | No URL and token saved yet.                                                                                                                                                                                    |
| `connecting`                 | An attempt is in progress.                                                                                                                                                                                     |
| `connected`                  | The sidecar answered, the combination is supported and the event stream is open.                                                                                                                               |
| `degraded` / `unavailable`   | Refused, DNS failure, network error, timeout or 503. Retried automatically.                                                                                                                                    |
| `degraded` / `unauthorized`  | The sidecar answered 401. Check the token.                                                                                                                                                                     |
| `degraded` / `incompatible`  | 409 or 426, or the Attraccess or plugin release is not in the table (or Attraccess does not report its version). Upgrade or downgrade to a supported combination.                                              |
| `degraded` / `misconfigured` | A bad URL or path prefix, a CA certificate or TLS failure, or a `Host` name the sidecar refuses (add it to `MATTER_SIDECAR_ALLOWED_HOSTS`). Certificate verification is always on; there is no way to skip it. |

**Reconnecting.** After a failure the plugin retries with exponential backoff and full jitter (base 1 s, cap 60 s). The backoff starts over after a connection stayed up for 30 seconds. `unauthorized`, `incompatible` and `misconfigured` retry at the 60 s cap. Saving or removing settings reconnects immediately, with no Attraccess restart. Requests are **never retried automatically**; only the connection probe (`/version`, `/v1/capabilities`) repeats.

**Event stream.** The plugin sends `resume` with its last cursor after each reconnect, drops events whose ID it has already delivered (a bounded set of 2,000 IDs) and detects a sequence gap within one stream instance. A new stream instance without a cursor is a fresh start, not a gap. On `reconciliation-required` (an expired, evicted, future or earlier-run cursor) or a gap, it clears its cursor and seen IDs, signals "reconciliation required" to the Matter features inside the plugin and reconnects fresh; nothing is skipped silently. It pings every 30 seconds and reconnects when nothing at all arrives for two intervals, which catches half-open connections. After a 1013 close (slow client) it reconnects with its last cursor.

**Requests** carry the wire version, `X-Attraccess-Version`, `X-Matter-Plugin-Version`, `X-Matter-Sidecar-Version` (the sidecar release the table pairs with the plugin), `X-Correlation-Id` and `X-Request-Deadline-Ms`. Responses are validated against the contract. A timeout of a physical operation is reported as `uncertain`.

**One wire version.** There is no fallback and no previous-version support. A sidecar that speaks a different version, or is a different release, **must be upgraded or downgraded** to the supported combination.

## Generated contract documents

`pnpm nx run matter-contract:export-contracts` writes OpenAPI 3.1 and JSON Schema documents to `dist/contracts/matter/` (`openapi.json`, `json-schema.json`). The output is deterministic, ignored by Git and never committed. `pnpm nx run matter-contract:test-artifacts` validates them with example payloads.

## What comes later

- [ATT-1000](https://linear.app/attraccess/issue/ATT-1000): production packaging and deployment.
- [ATT-998](https://linear.app/attraccess/issue/ATT-998): fabric persistence, encrypted backup and recovery.
- Later Matter feature tickets: commissioning, device inventory, commands, subscriptions, Thread, OTA, permissions and audit. Defining their contract shapes here does not deliver those features.

See also the [operator guide](devices/matter/operator.md).
