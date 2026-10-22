# Matter sidecar operations

This is a local development foundation. Installable plugin packaging, diagnostics, compatibility validation and event transport work; device features, service authentication and production deployment are deferred. See [architecture](devices/matter-architecture.md).

## Build and start

Use Node >=24 and the repository's pnpm dependencies:

```bash
pnpm nx run-many -t build,typecheck,lint,test -p matter-contract,matter-sidecar,plugin-matter
pnpm nx run matter-sidecar:integration-test
pnpm nx run matter-contract:export-contract
pnpm nx run matter-contract:validate-artifacts
pnpm nx run plugin-matter:pack-test
MATTER_PORT=3080 pnpm nx run matter-sidecar:start
```

Alternatively, after building, run `node dist/apps/matter-sidecar/main.mjs`. Plugin staging output is `apps/plugins/matter/package`; use the existing plugin installation flow. The plugin intentionally starts no connections and exposes no device routes. Its exact host requirement is 1.10.0.

`MATTER_HOST` defaults to `127.0.0.1` and accepts only `127.0.0.1` or `::1`. `MATTER_PORT` defaults to `3080`; range `0–65535` is validated before listening. Port `0` requests an assigned free port, printed in the ready message. Port collisions fail startup. Invalid/remote bind configuration exits the sidecar with an actionable diagnostic and leaves core running.

The application factory validates bounded settings for embedded tests/adapters: 1 MiB JSON/WebSocket messages, 10-second REST deadline, 10-second initial resume deadline, 1 MiB outgoing client queue, 10,000 replay events, five-minute replay age and five-second shutdown grace by default. The standalone executable exposes only bind/port configuration in this slice. Exceeding payload limits returns `413 PAYLOAD_TOO_LARGE` for REST. Oversized WebSocket messages (including fragmented messages) are rejected by the parser with close code `1009`, an empty reason and no JSON error envelope; no request values are echoed. Reduce the message size before reconnecting. Application-level WebSocket errors use structured envelopes when the outgoing queue has room. Stalled REST uploads return `504`. Operations carry finite UTC deadlines and cancellation IDs, but cancellation handlers are unavailable.

The replay buffer supports the tested transport workload of 1,000 simulated machines reporting once per minute (5,000 reports across five rounds), with count headroom for other events. This is not a limit on connected machines or a real-device qualification. Reports expire at five minutes regardless of the event count. Replay is paced; pending live reports plus the active write remain within the client queue limit. Writes stalled for 10 seconds close with `4009` and require reconciliation. More frequent or larger reports may hit count or queue bounds sooner. Physical Matter subscriptions and radio/network scale remain untested because device operations are deferred.

The sidecar is not integrated into `pnpm serve`. To run core separately, use `pnpm serve --only=api` and read `.dev-serve-ports.json` for the assigned API URL. Never assume port 3000 belongs to this worktree.

## Diagnose availability

```bash
curl http://127.0.0.1:3080/health/live
curl http://127.0.0.1:3080/health/ready
curl http://127.0.0.1:3080/version
```

Liveness means the process can answer. Readiness means configuration, the pinned native matter.js platform/crypto and transport initialization succeeded, and shutdown has not started. It is independent of fabric initialization: `fabricInitialized` remains `false`. An absent fabric is not a readiness failure. `/health/ready` returns `503` when unready and explains initialization/draining status in its fixed schema.

`/version` reports build version and Git revision, sidecar release, the loaded/verified matter.js release, storage-schema version `1`, wire-protocol version `1`, capabilities and supported release tuple. Storage-schema reporting does not imply persistence or migration support. No fabric is created on startup.

On startup failure, check Node >=24, the exact dependency installation, loopback address and port availability. Reinstall locked dependencies if the loaded matter.js version differs. Build checks reject release/manifest drift before startup. Request/client errors are contained. Fatal runtime failure exits only the sidecar.

## Resolve incompatible versions

Example: a plugin 0.2.0 request is rejected even though it uses message version 1:

```bash
curl -i http://127.0.0.1:3080/v1/capabilities \
  -H 'x-matter-wire-version: 1' \
  -H 'x-attraccess-version: 1.10.0' \
  -H 'x-matter-plugin-version: 0.2.0' \
  -H 'x-request-id: 00000000-0000-4000-8000-000000000001'
```

Expect `409 INCOMPATIBLE_RELEASE`, the received and supported combinations, and an upgrade/downgrade instruction. Align **Attraccess 1.10.0, plugin 0.1.0 and sidecar 0.1.0**; do not bypass the check. Missing or unsupported wire metadata produces a version-1 error with `426`; malformed/missing correlation UUID produces `400`. Diagnostic routes remain accessible to inspect the supported tuple.

## Stop and recover

SIGTERM and SIGINT mark the sidecar unready immediately, stop accepting connections/work, publish draining lifecycle status, close WebSockets, drain HTTP requests and dispose initialized platform resources. Shutdown is idempotent and bounded to five seconds by default. Uncooperative connections/resources are terminated at the bound. Start a new process after a fatal failure; its stream instance changes.

After a replay gap, restart or slow-client closure, follow the reconciliation instructions in the [event contract](devices/matter-architecture.md#events-resume-and-reconciliation). Keep consumer state unreconciled: authoritative recovery is unavailable because device snapshots and the reconnecting plugin client are not yet implemented. Do not treat a fresh subscription as an authoritative state snapshot. Never retry an ambiguous physical command automatically.

Do not expose the sidecar remotely or connect a browser directly. Release headers are not credentials; authenticated service connectivity belongs to ATT-1001. Production packaging belongs to ATT-1000, and persistent fabric/backup recovery to ATT-998.
