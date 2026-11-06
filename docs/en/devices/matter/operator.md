# Matter: Operator Guide

> **Connectivity only.** The sidecar can be built, started, secured and connected to Attraccess, but it controls no devices yet. Read the [architecture](devices/matter/architecture.md) first.

## Build and start

```bash
pnpm nx run matter-sidecar:build
export MATTER_SIDECAR_AUTH_TOKEN="$(openssl rand -base64 48)"   # keep this value: the plugin needs it
node dist/apps/matter-sidecar/main.js
```

The build bundles the sidecar into `dist/apps/matter-sidecar/main.js` and stamps the current Git revision. matter.js is loaded from `node_modules` at run time, so the pinned release is the one that runs. Node.js `>=24.22.1 <25` is required.

The sidecar **refuses to start without a service token** (see below). Starting it loads matter.js but opens no Matter ports (UDP 5540, mDNS), writes no Matter storage and creates no fabric. By default it listens on `127.0.0.1` only. Prefer `MATTER_SIDECAR_AUTH_TOKEN_FILE` (a file or a deployment secret) over the environment variable where you can, because environment variables are visible to other processes of the same user.

## Configuration

All settings are environment variables, validated before the sidecar listens. An empty variable counts as unset. A missing or invalid value stops only the sidecar and prints which variable to fix.

| Variable                                                       | Default      | Range                             | Meaning                                                                                                                        |
| -------------------------------------------------------------- | ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MATTER_SIDECAR_AUTH_TOKEN` / `MATTER_SIDECAR_AUTH_TOKEN_FILE` | **required** | 32–512 printable ASCII characters | The service token. The file variant is read at start-up and surrounding whitespace is trimmed. Set only one of the two.        |
| `MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS` / `…_PREVIOUS_FILE`       | unset        | same                              | The old token, accepted alongside the current one while you rotate it.                                                         |
| `MATTER_SIDECAR_BIND_HOST`                                     | `127.0.0.1`  | an address                        | Address to listen on. Anything but loopback needs the next two rows.                                                           |
| `MATTER_SIDECAR_ALLOWED_HOSTS`                                 | unset        | comma-separated names             | Extra `Host` names accepted besides loopback. **Required** when the bind address is not loopback.                              |
| `MATTER_SIDECAR_TLS_CERT_FILE` / `MATTER_SIDECAR_TLS_KEY_FILE` | unset        | PEM file paths                    | Serve HTTPS and WSS. Set both or neither.                                                                                      |
| `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE`                         | `false`      | `true` / `false`                  | Allow a non-loopback bind **without** TLS, for a trusted container network or a TLS-terminating reverse proxy. Logs a warning. |
| `MATTER_SIDECAR_PORT`                                          | `8581`       | `0`–`65535`                       | TCP port (`0` picks a free port)                                                                                               |
| `MATTER_SIDECAR_MAX_MESSAGE_BYTES`                             | `1048576`    | `1`–`16777216`                    | Largest request body and WebSocket message                                                                                     |
| `MATTER_SIDECAR_REQUEST_DEADLINE_MS`                           | `10000`      | `1`–`60000`                       | Request deadline                                                                                                               |
| `MATTER_SIDECAR_SHUTDOWN_GRACE_MS`                             | `5000`       | `1`–`60000`                       | Time allowed for shutdown                                                                                                      |
| `MATTER_SIDECAR_REPLAY_MAX_EVENTS`                             | `1000`       | `1`–`100000`                      | Events kept for replay                                                                                                         |
| `MATTER_SIDECAR_REPLAY_MAX_AGE_MS`                             | `300000`     | `1`–`86400000`                    | Maximum age of replayable events                                                                                               |
| `MATTER_SIDECAR_CLIENT_QUEUE_BYTES`                            | `1048576`    | `1`–`67108864`                    | Per-WebSocket-client queue budget, including the replay after a reconnect                                                      |

The sidecar refuses to start (and names the variable to fix) when: there is no token, a token has the wrong length or characters, both `X` and `X_FILE` are set, the bind address is not loopback and there is no allowed host, the bind address is not loopback without TLS and without `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true`, or only one of the certificate and key files is set.

### Generating a token

```bash
openssl rand -base64 48
```

Any 32–512 printable ASCII characters work (no spaces). Treat the token like a password. The sidecar also accepts it from a file: `MATTER_SIDECAR_AUTH_TOKEN_FILE=/run/secrets/matter-token`.

## Connect Attraccess to the sidecar

1. Install the Matter plugin (it needs Attraccess 1.11.0 or newer). It asks for the `DATABASE_ACCESS` and `MANAGE_SECRETS` permissions.
2. Open **Devices → Matter** (visible to users with the `system.plugins.manage` permission).
3. Enter the **sidecar URL** (for example `http://127.0.0.1:8581`) and the **token**, then **Save**. Add the **CA certificate** only if the sidecar uses a private CA.

The page shows the connection state and polls it every five seconds. After saving, it should reach **Connected** within seconds and show the sidecar, matter.js and wire versions. The token is stored encrypted and is never shown again; use **Replace** to enter a new one. **Remove configuration** deletes the settings and disconnects.

| State                    | What to do                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not configured           | Enter URL and token.                                                                                                                                                                                                                                       |
| Degraded – unavailable   | Check that the sidecar runs, and the URL, port and firewall. The page shows when the next attempt happens. It reconnects by itself once the sidecar is back.                                                                                               |
| Degraded – unauthorized  | The sidecar rejected the token. Compare it with `MATTER_SIDECAR_AUTH_TOKEN` (or the previous token during a rotation) and enter it again.                                                                                                                  |
| Degraded – incompatible  | The page shows the received and the supported combination. **Upgrade or downgrade** Attraccess, the plugin or the sidecar to a supported combination. "Host version unavailable" means Attraccess is older than 1.11.0.                                    |
| Degraded – misconfigured | Check the URL (and path prefix), and that the CA certificate matches the sidecar certificate and host name. If the page says the Host name is not allowed, add that name to `MATTER_SIDECAR_ALLOWED_HOSTS`. Certificate verification cannot be turned off. |

A warning appears when the URL is plain `http` to an address other than this machine: the token would cross the network unencrypted.

## Topologies

- **Same host, loopback (recommended).** Run the sidecar next to Attraccess with the defaults. URL `http://127.0.0.1:8581`. No TLS needed: traffic never leaves the machine.
- **Container network.** Put the sidecar and Attraccess on a private network that only they share:
  `MATTER_SIDECAR_BIND_HOST=0.0.0.0`, `MATTER_SIDECAR_ALLOWED_HOSTS=matter-sidecar` (the name Attraccess uses), and either TLS (`MATTER_SIDECAR_TLS_CERT_FILE`/`…_KEY_FILE`, with the CA entered in the Matter page) or `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true`. Do not publish the port to the host network or the internet. URL `http://matter-sidecar:8581`.
- **Reverse proxy with TLS and a path prefix.** The proxy terminates TLS and forwards `https://example.com/matter/…` to the sidecar. The proxy must strip the prefix, forward WebSocket upgrades and the `Authorization` header, and pass a `Host` name listed in `MATTER_SIDECAR_ALLOWED_HOSTS`. URL `https://example.com/matter` leads to `/matter/v1/...`.

## Credential rotation

Rotate the token without rebuilding anything and without a lasting interruption:

1. Set the **new** token as `MATTER_SIDECAR_AUTH_TOKEN` and the **old** one as `MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS` (deployment secrets or files), then restart the sidecar. The plugin may show _unavailable_ for a few seconds while the sidecar restarts, then reconnects by itself, because the old token is still accepted.
2. Enter the **new** token in the Matter page (**Replace**, then **Save**). The plugin reconnects with it.
3. Remove `MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS` and restart the sidecar.

Token files are read at start-up only, so each step needs a restart.

## Health and version

```bash
curl http://127.0.0.1:8581/health/live
curl http://127.0.0.1:8581/health/ready
curl -H "Authorization: Bearer $MATTER_SIDECAR_AUTH_TOKEN" http://127.0.0.1:8581/version
```

- `/health/live` answers `{"status":"live"}` whenever the process runs.
- `/health/ready` answers 200 with `"status":"ready"` once configuration, matter.js start-up and the transport succeeded. It answers 503 with `"draining"` while the sidecar shuts down. The sidecar opens its port only after start-up, so `"starting"` never reaches a caller in this release. The `fabric` field (`uninitialized` in this release) is reported separately and never affects readiness.
- `/version` needs the token. It reports `build.version` and `build.commit` (the Git revision the sidecar was built from), `sidecar` (the sidecar release), `matterJs` (the matter.js release actually loaded), `storageSchemaVersion` (`1`; reporting it adds no persistence) and `wireVersion` (`1`).

`/health/live` and `/health/ready` are anonymous, so container probes work, and reveal no versions. `/version` needs the token but no compatibility headers, so it stays usable while you troubleshoot a version mismatch. Without a valid token the answer is HTTP 401, and nothing about versions is revealed.

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
      "received": { "wireVersion": 1, "attraccess": "1.10.0", "plugin": "0.2.0-alpha.0", "sidecar": "0.2.0-alpha.0" },
      "problems": [],
      "running": { "sidecar": "0.2.0-alpha.0", "matterJs": "0.18.0" },
      "supported": [
        {
          "wireVersion": 1,
          "attraccess": "^1.11.0",
          "plugin": "0.2.0-alpha.0",
          "sidecar": "0.2.0-alpha.0",
          "matterJs": "0.18.0"
        }
      ]
    }
  }
}
```

Malformed or missing release values are never echoed; they appear as `null` in `received` and are listed in `problems` (for example `plugin:malformed`).

To fix it, compare `received` with `supported`, then **upgrade or downgrade** Attraccess, the Matter plugin or the sidecar until all three match a supported combination. Use `/version` to see what the sidecar runs. A wrong wire version answers HTTP 426 and names the supported version. There is no fallback to another wire version: a mismatched sidecar must be upgraded or downgraded.

## Shutdown

`SIGTERM` and `SIGINT` shut the sidecar down gracefully: it reports unready, refuses new work, closes WebSocket clients with code 1001, finishes in-flight requests and exits within the grace period. Repeated signals are safe. A request or client error never crashes the process, and a fatal error ends only the sidecar, with an actionable message on stderr. If the port is already taken, the message says to set `MATTER_SIDECAR_PORT` to a free port. Attraccess keeps running.

## Security notes

- Every request except `/health/live` and `/health/ready` needs `Authorization: Bearer <token>`. Keep the token secret, give it to the sidecar through a secret or file, and rotate it with the procedure above when it may have leaked. There is no lockout; the token's length and randomness protect it, so use a generated one.
- Keep the default loopback bind unless the sidecar must be reached across a network. For a remote bind, use TLS (and enter the CA in the Matter page) or a trusted private network. `MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true` sends the token unencrypted and must not cross an untrusted network.
- Requests with a browser `Origin` header are refused with HTTP 403, and a `Host` that is neither loopback nor in `MATTER_SIDECAR_ALLOWED_HOSTS` is refused too. The check runs before authentication.
- Failed authentications are logged at warn level (rate-limited) and never include the token or the header value. Setup codes, Thread datasets and fabric secrets never appear in logs, events or health output.
- Certificates and token files are read at start-up. Renew or rotate them with a restart.

## Checks and generated documents

```bash
pnpm nx run-many -t lint,typecheck,test -p matter-contract,matter-sidecar
pnpm nx run matter-sidecar:test-integration   # real local HTTP and WebSocket, simulated Matter features
pnpm nx run matter-sidecar:test-built         # the built process
pnpm nx run matter-contract:export-contracts  # writes dist/contracts/matter/
pnpm nx run matter-contract:test-artifacts
pnpm nx run-many -t lint,typecheck,test,e2e,pack-test -p plugin-matter   # e2e runs the plugin against the real sidecar, including SIGTERM/SIGKILL
```

The tests simulate Matter features and devices. Real commissioning, devices, Thread and OTA are untested until later tickets.
