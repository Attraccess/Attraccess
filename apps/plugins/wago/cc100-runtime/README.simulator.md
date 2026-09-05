# WAGO CC100 simulator

The simulator is a broker-facing CC100 controller for local UI and integration testing. It uses the production `WagoRuntime` configuration and command semantics, but replaces CC100 sysfs/IIO access with a deterministic in-memory device model.

Build and start the broker plus simulator:

```sh
docker compose -f apps/plugins/wago/cc100-runtime/docker-compose.simulator.yml up --build
```

The compose broker listens only on loopback. Its RabbitMQ management UI is
`http://127.0.0.1:15672` (local development credentials: `attraccess` / `password`).
Configure this broker and its credential provisioning in Attraccess before
creating the enrollment package. Discovery always uses `attraccess/wago/discovery`;
the operational namespace comes from the claim, independently of discovery.

For a separately configured local broker, build and run the image directly:

```sh
docker build -f apps/plugins/wago/cc100-runtime/Dockerfile.simulator -t wago-cc100-simulator .
docker run --rm --name wago-cc100-simulator \
  -e WAGO_MQTT_URL=mqtt://host.docker.internal:1883 \
  -e WAGO_HARDWARE_ID -e WAGO_PAIRING_CODE -e WAGO_ENROLLMENT_SECRET \
  -e WAGO_ENROLLMENT_USERNAME -e WAGO_ENROLLMENT_PASSWORD \
  -v cc100-simulator-state:/var/lib/attraccess-wago wago-cc100-simulator
```

The host URL above is for Docker Desktop. On Linux, use your local Docker broker
network and its service name instead.

Before starting, create a WAGO enrollment package in Attraccess and export its values. The broker URL must point at the broker selected in the WAGO plugin; for the included broker it is `mqtt://localhost:1883` from Attraccess and `mqtt://mqtt:1883` from the simulator container.

```sh
export WAGO_HARDWARE_ID=simulated-cc100-01
export WAGO_PAIRING_CODE=482931
export WAGO_ENROLLMENT_SECRET=the-enrollment-secret
export WAGO_ENROLLMENT_USERNAME=the-enrollment-username
export WAGO_ENROLLMENT_PASSWORD=the-enrollment-password
```

The simulator persists the permanent credential, accepted configuration, output state, and command deduplication history in `cc100-simulator-state`. Remove that named volume only to simulate a factory-reset controller.

It also persists the hardware ID. A claimed restart needs only `WAGO_MQTT_URL`
and the same state volume; enrollment variables can be removed. Supplying a
different hardware ID for an existing volume fails instead of reusing another
controller's credentials. Volumes from older simulator versions need the original
`WAGO_HARDWARE_ID` once to record that identity.

`WAGO_INITIAL_VALUES` is a JSON map keyed by `<hardwareProfile>:<channel>`, for example `'{"751-9301:1":true,"879-3000:0":42}'`. `WAGO_MEASUREMENT_STEP` changes every numeric reading by a fixed amount at each measurement interval.
`WAGO_CAPABILITIES` is a JSON list used in the discovery announcement; it defaults to the simulator's full protocol capability list and can be used to test compatibility failures.

Set `WAGO_SCENARIO` to one of:

- `normal`: normal reads and writes.
- `offline`: connects, publishes initial state, then disconnects.
- `stale-heartbeat`: stays connected without heartbeat or measurement timers.
- `reject-configuration`: rejects every desired configuration with `simulated_rejection`.
- `write-failure`: rejects commands after a simulated device write failure.
- `feedback-mismatch`: returns inverted feedback for written boolean points and publishes `feedback_mismatch` faults.

Pulse and guard behavior are configured through the desired configuration and are executed by the shared runtime. Use an initial boolean value for the physical point that backs the guard channel to deterministically allow or deny commands.

## Isolated broker integration tests (no Docker required)

```sh
pnpm nx run wago-cc100-runtime:test-simulator-integration
```

This builds the executable simulator, installs pinned Aedes 0.51.3 into a fresh
temporary directory, binds a real MQTT broker to `127.0.0.1` on an ephemeral port,
and removes broker dependencies and simulator state afterward. It requires npm
registry access; it never reads the application's `.env` or connects to an
existing broker. Authentication and topic policies come from the actual
WagoService enrollment/claim requests. Repository storage and host SDK boundaries
are in-memory test adapters; discovery, physical verification, claim, heartbeat
parsing, configuration reconciliation, and WagoFlowService are real code.

The strict CI target verifies measurement-to-output routing through the actual
parser and flow service, then requires a runtime acknowledgement and physical
output feedback. It fails if ATT-978 is absent or runtime wire messages are
incompatible. It does not fill in missing producer fields or accept log messages
as proof. The runtime and ATT-979 owners must supply the reconciled producer
contract before the complete target can pass.

For staged integration against another **committed** branch without changing any
worktree:

```sh
node apps/plugins/wago/cc100-runtime/integration/run.mjs --flow-ref=fleet/att-978-flow-freshness
```

The command prints the exact tested SHA and reads its backend TypeScript sources
into temporary storage. For simulator-only work while those dependencies are
pending, use `--lifecycle-only`; this explicitly skips the flow test and is not
the CI acceptance target. The lifecycle checks include enrollment reconnect,
permanent-identity TCP reconnect, commands after reconnect, persisted identity
and outputs across process restart, plus offline, stale-heartbeat and rejected
configuration scenarios.

Both enrollment and operational MQTT connections use `clientId=username`, as
required by provisioned RabbitMQ subscription-queue permissions. The broker tests
reject wrong client IDs with otherwise valid credentials. Claim acknowledgement
is published on the enrollment connection only after saving permanent credentials;
the simulator waits for MQTT PUBACK before ending that connection. An injected
state-write failure must produce neither an acknowledgement nor an operational
connection; replaying the actual claim after storage recovers completes handoff.

The runner also snapshots `origin/main` (or `--main-ref=<commit>`) and runs its real
WagoService to capture the current claim payload and verify token acknowledgement
and enrollment revocation. This is separate from the local heartbeat/parser test;
no commissioning source is patched. Full git history is checked out in CI so the
main source is available.

To test a producer-owner commit alongside the flow-owner commit:

```sh
node apps/plugins/wago/cc100-runtime/integration/run.mjs \
  --runtime-ref=<producer-commit> --flow-ref=<flow-commit>
```

`--runtime-ref` stages the exact committed runtime modules in temporary storage,
overlays only the owned simulator entrypoint and device adapter, typechecks that
combination, then builds it. It does not merge any runtime into this worktree or
modify another worktree. The strict test sends commands with
`expectedConfigurationRevision` and `expiresAt`; it expects physical percent 42
to arrive as `kind: live`, `unit: millipercent`, `value: 42000`, with canonical ISO
`timestamp`, a UUID `streamId` per boot and independent category counters. It
keeps the same consumer alive across simulator restart to verify the new stream.

`WAGO_HEARTBEAT_INTERVAL_MS` (default 30000) and
`WAGO_MEASUREMENT_INTERVAL_MS` (default 5000) accept positive integer milliseconds
and allow deterministic accelerated integration tests. `WAGO_STATE_PATH` selects
the state file (default `/var/lib/attraccess-wago/state.json`). Keep separate state
paths for separate simulator instances.

This suite does not prove the browser UI, RabbitMQ management provisioning, or
physical CC100 behavior. Hardware acceptance remains ATT-984.

### Corrective-stack verification baseline (2026-09-05)

With simulator base `250d49a8` and committed ATT-978 flow/parser `13b0c255`, the
four isolated lifecycle/scenario checks pass. The strict flow check receives the
runtime's real wire payload `{"channelId":"level","unit":"percent","value":42}`
and fails in `parseOperationalMessage` with `operational timestamp is invalid`.
That producer also lacks `sequence`; its state and acknowledgement messages lack
both fields. ATT-979 additionally requires the owners to reconcile source timestamp,
typed units/kinds and restart-safe stream identity. The harness must continue to
use the shared producer unchanged while that contract is corrected. No successful
measurement-to-output integration is claimed for this baseline.
