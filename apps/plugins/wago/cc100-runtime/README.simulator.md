# WAGO CC100 simulator

The simulator is a broker-facing CC100 controller for local UI and integration testing. It uses the production `WagoRuntime` configuration and command semantics, but replaces CC100 sysfs/IIO access with a deterministic in-memory device model.

Build and start the broker plus simulator:

```sh
docker compose -f apps/plugins/wago/cc100-runtime/docker-compose.simulator.yml up --build
```

Before starting, create a WAGO enrollment package in Attraccess and export its values. The broker URL must point at the broker selected in the WAGO plugin; for the included broker it is `mqtt://localhost:1883` from Attraccess and `mqtt://mqtt:1883` from the simulator container.

```sh
export WAGO_HARDWARE_ID=simulated-cc100-01
export WAGO_PAIRING_CODE=482931
export WAGO_ENROLLMENT_SECRET=the-enrollment-secret
export WAGO_ENROLLMENT_USERNAME=the-enrollment-username
export WAGO_ENROLLMENT_PASSWORD=the-enrollment-password
```

The simulator persists the permanent credential, accepted configuration, output state, and command deduplication history in `cc100-simulator-state`. Remove that named volume only to simulate a factory-reset controller.

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
