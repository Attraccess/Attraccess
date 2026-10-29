# Matter: Operator Guide

> **Groundwork only.** The sidecar can be built, started and monitored, but it controls no devices yet. Read the [architecture](architecture.md) first.

## Build and start

```bash
pnpm nx run matter-sidecar:build
node dist/apps/matter-sidecar/main.js
```

The build bundles the sidecar into `dist/apps/matter-sidecar/main.js` and stamps the current Git revision. matter.js is loaded from `node_modules` at run time, so the pinned release is the one that runs. Node.js `>=24.22.1 <25` is required.

Starting the sidecar loads matter.js but opens no Matter ports (UDP 5540, mDNS), writes no Matter storage and creates no fabric. It listens on `127.0.0.1` only.

## Configuration

All settings are optional environment variables, validated before the sidecar listens. An invalid value stops only the sidecar and prints which variable to fix.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MATTER_SIDECAR_PORT` | `8581` | TCP port on loopback (`0` picks a free port) |
| `MATTER_SIDECAR_MAX_MESSAGE_BYTES` | `1048576` | Largest request body and WebSocket message |
| `MATTER_SIDECAR_REQUEST_DEADLINE_MS` | `10000` | Request deadline |
| `MATTER_SIDECAR_SHUTDOWN_GRACE_MS` | `5000` | Time allowed for shutdown |
| `MATTER_SIDECAR_REPLAY_MAX_EVENTS` | `1000` | Events kept for replay |
| `MATTER_SIDECAR_REPLAY_MAX_AGE_MS` | `300000` | Maximum age of replayable events |
| `MATTER_SIDECAR_CLIENT_QUEUE_BYTES` | `1048576` | Per-WebSocket-client queue budget |

There is no bind-address setting. The sidecar never listens on anything but loopback.

## Health and version

```bash
curl http://127.0.0.1:8581/health/live
curl http://127.0.0.1:8581/health/ready
curl http://127.0.0.1:8581/version
```

- `/health/live` answers `{"status":"live"}` whenever the process runs.
- `/health/ready` answers 200 with `"status":"ready"` once configuration, matter.js start-up and the transport succeeded. It answers 503 with `"starting"` or `"draining"` otherwise. The `fabric` field (`uninitialized` in this release) is reported separately and never affects readiness.
- `/version` reports `build.version` and `build.commit` (the Git revision the sidecar was built from), `sidecar` (the sidecar release), `matterJs` (the matter.js release actually loaded), `storageSchemaVersion` (`1`; reporting it adds no persistence) and `wireVersion` (`1`).

These endpoints need no compatibility headers, so they stay reachable while you troubleshoot a version mismatch.

## An incompatible combination

A `/v1/` request, or a WebSocket upgrade to `/v1/events`, with an unsupported release combination fails with HTTP 409:

```json
{
  "error": {
    "code": "incompatible_release",
    "message": "Attraccess, the Matter plugin and the Matter sidecar are not a supported combination. Upgrade or downgrade one of them to a supported combination.",
    "correlationId": "5a1f6c0e-6f55-4a53-9a6e-2c6d6b0f5b1c",
    "retryable": false,
    "details": {
      "received": { "wireVersion": 1, "attraccess": "1.10.0", "plugin": "0.1.0-alpha.0", "sidecar": "0.1.0-alpha.0" },
      "problems": [],
      "running": { "sidecar": "0.1.0-alpha.0", "matterJs": "0.18.0" },
      "supported": [ { "wireVersion": 1, "attraccess": "^1.11.0", "plugin": "0.1.0-alpha.0", "sidecar": "0.1.0-alpha.0", "matterJs": "0.18.0" } ]
    }
  }
}
```

Malformed or missing release values are never echoed; they appear as `null` in `received` and are listed in `problems` (for example `plugin:malformed`).

To fix it, compare `received` with `supported`, then **upgrade or downgrade** Attraccess, the Matter plugin or the sidecar until all three match a supported combination. Use `/version` to see what the sidecar runs. A wrong wire version answers HTTP 426 and names the supported version.

## Shutdown

`SIGTERM` and `SIGINT` shut the sidecar down gracefully: it reports unready, refuses new work, closes WebSocket clients with code 1001, finishes in-flight requests and exits within the grace period. Repeated signals are safe. A request or client error never crashes the process, and a fatal error ends only the sidecar, with an actionable message on stderr. Attraccess keeps running.

## Security notes

- The sidecar does not authenticate callers yet. Any local process can call it. **Do not expose it remotely** and do not put it behind a public reverse proxy until service authentication ([ATT-1001](https://linear.app/attraccess/issue/ATT-1001)) exists.
- Requests with a browser `Origin` header or a non-loopback `Host` are refused with HTTP 403.
- Setup codes, Thread datasets and fabric secrets never appear in logs, events or health output.

## Checks and generated documents

```bash
pnpm nx run-many -t lint,typecheck,test -p matter-contract,matter-sidecar
pnpm nx run matter-sidecar:test-integration   # real local HTTP and WebSocket, simulated Matter features
pnpm nx run matter-sidecar:test-built         # the built process
pnpm nx run matter-contract:export-contracts  # writes dist/contracts/matter/
pnpm nx run matter-contract:test-artifacts
pnpm nx run-many -t lint,test,e2e,pack-test -p plugin-matter
```

The tests simulate Matter features and devices. Real commissioning, devices, Thread and OTA are untested until later tickets.
