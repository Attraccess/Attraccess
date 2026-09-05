# WAGO CC100 Docker Runtime

> **Work in progress.** This guide documents the current `attraccess-wago-cc100` runtime release. It is not hardware-validated yet: [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies) is the release gate. Do not use it to control equipment until the required hardware evidence, image digest, and least-privilege deployment are published.

The runtime runs on a WAGO CC100 `751-9301` with WAGO Linux firmware and Docker. It does not use CODESYS and does not accept uploaded controller code. Its current protocol version is `1.0.0`; runtime version is `0.1.0`.

## Safety boundary

This runtime is **not safety rated**. It must not be used as an emergency stop, personnel-protection function, or replacement for certified safety circuits. Keep all official emergency-stop and safety circuits independent. A runtime fault, loss of MQTT, container crash, reboot, or configuration error must be treated as an operational fault, not proof of a safe state.

## Preconditions

Before deployment, confirm all of the following:

- The controller is a `751-9301`. The published image is built for `linux/arm/v7`.
- The CC100 has a WAGO Linux firmware release with Docker support. WAGO's onboard-I/O reference requires firmware 21 (`03.09.04`) or later; record the installed firmware in the deployment record.
- An administrator has SSH access or WBM access to the CC100. Use an isolated administrative network and restrict SSH/WBM access to authorised operators.
- The controller can reach the configured MQTT broker and the registry hosting `ghcr.io`. There are no inbound runtime ports; outbound MQTT and image-registry access are required.
- Persistent storage is available for Docker and for `/var/lib/attraccess-wago`. WAGO's Docker lifecycle uses `/home/docker` for Docker data.
- A per-controller hardware ID, pairing code, MQTT URL, discovery credential, and enrollment secret have been issued by the Attraccess operator.
- The physical assembly, wiring, guards, contactors, and non-safety stop/fault/permissive signals have been reviewed. The `751-9301`, `879-3000`, and `879-1300` reference assemblies require the physical verification checklist below.

## Enable Docker

Use the WAGO-supported Docker lifecycle through SSH. `config_docker activate` installs Docker if necessary, enables it at startup, enables IP forwarding, and starts the daemon.

```sh
config_docker install
config_docker activate
docker version
docker info
```

Use the WBM Docker controls only if they perform the same install and activation lifecycle. Do not manually copy daemon binaries or enable an alternative container engine. If activation fails, collect the command output and WAGO system logs before making configuration changes.

> WAGO's lifecycle script refuses a controller booted from an SD card. Treat that result as a deployment blocker and follow the WAGO-supported storage arrangement.

## Obtain and verify the image

The runtime manifest names this intended version tag:

```text
ghcr.io/attraccess/wago-cc100-runtime:0.1.0
```

CI publishes a commit-SHA tag for `linux/arm/v7`, verifies the published manifest, and uploads the immutable `<tag>@<digest>` reference as the `wago-cc100-runtime-image` artifact. Use that recorded digest rather than a mutable tag.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{index (split (index .RepoDigests 0) "@") 1}}'
```

The inspected digest must exactly match the release digest. Retain the pulled image locally for rollback; do not delete the previous known-good image until the new image has passed the physical verification checklist.

## Prepare controller configuration

Create a root-readable environment file. It contains broker credentials and must never be committed, copied to tickets, or included in support bundles.

```sh
install -d -m 0700 /etc/attraccess-wago
umask 077
cat >/etc/attraccess-wago/runtime.env <<'EOF'
WAGO_HARDWARE_ID=<controller-hardware-id>
WAGO_MQTT_URL=mqtts://<broker-host>:8883
WAGO_MQTT_USERNAME=<initial-controller-username>
WAGO_MQTT_PASSWORD=<initial-controller-password>
WAGO_PAIRING_CODE=<controller-pairing-code>
WAGO_ENROLLMENT_SECRET=<enrollment-secret>
WAGO_MQTT_PREFIX=attraccess/wago
EOF
chmod 0600 /etc/attraccess-wago/runtime.env
```

The runtime requires `WAGO_HARDWARE_ID`, `WAGO_MQTT_URL`, and `WAGO_PAIRING_CODE`. `WAGO_MQTT_USERNAME` and `WAGO_MQTT_PASSWORD` are discovery credentials until the controller is claimed. `WAGO_ENROLLMENT_SECRET` is required for discovery enrollment. `WAGO_MQTT_PREFIX` defaults to `attraccess/wago`; use the issued namespace if it differs. The persistent state path defaults to `/var/lib/attraccess-wago/state.json` and stores the last accepted configuration, output state, bounded command history, and permanent credentials. The file is created with mode `0600`.

### I/O paths and host access

The digital runtime requires `WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1`. The installer must verify model `751-9301` and firmware `31` before selecting it. Manual `WAGO_IO_PATHS` mappings are rejected; existing installations must republish the explicit digital mapping when upgrading.

WAGO documents these relevant host paths:

- Digital outputs: `/sys/kernel/dout_drv/DOUT_DATA`
- Digital inputs: `/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din`
- Analog and Pt1000 values: the relevant `/sys/bus/iio/devices/iio:device*/...` raw files
- Calibration data: `/etc/calib`
- RS-485: `/dev/serial` on the `751-9301`; its serial mode is RS-485 only

The image instantiates the onboard digital adapter. Channels `0..3` are DO1..DO4 and `4..11` are DI1..DI8. Inputs are independent packed bits; output updates preserve other bits and are serialized across channels. Direction mismatches, duplicate output owners and unsupported points are rejected before configuration acceptance. Analog, Pt1000, RS-485 and Modbus are not selected by this artifact.

The manifest declares `privileged: false`, UID `10001`, all capabilities dropped and no-new-privileges. Only the DIN file is mounted read-only and DOUT_DATA read-write. The installer must grant this UID the necessary file permissions and ensure exclusive output ownership. No second runtime, CODESYS program or host process may write the output register concurrently.

The documented layout is implemented and software-tested, but firmware-31 access permissions and reboot persistence remain unvalidated. Do not claim a hardware-validated least-privilege deployment until ATT-984 supplies evidence. The complete integration contract is in [`HARDWARE.md`](https://github.com/Attraccess/Attraccess/blob/main/apps/plugins/wago/cc100-runtime/HARDWARE.md). Commissioning-service integration is tracked separately in ATT-1057.

- Bind only the two digital register files at the destinations below. Missing sources must fail installation.
- Do not grant analog, calibration or serial access to this digital-only artifact.
- Mount a named volume only at `/var/lib/attraccess-wago` so accepted configuration and command de-duplication survive replacement or reboot.
- Do not mount the Docker socket, host root filesystem, or an unrestricted `/dev` directory. The runtime exposes no inbound network service and currently needs only outbound MQTT.

## Start the WIP runtime

This is a deployment-contract example, not an instruction to operate unvalidated hardware. The installer must first verify firmware/model, grant the required UID permissions and ensure exclusive register ownership. Substitute the image digest only after completing that review. Do not use root or privileged mode as a fallback.

```sh
export IMAGE='ghcr.io/attraccess/wago-cc100-runtime@sha256:<published-release-digest>'
docker volume create attraccess-wago-state
docker run -d \
  --name attraccess-wago-cc100 \
  --restart unless-stopped \
  --user 10001 --cap-drop ALL --security-opt no-new-privileges \
  --env-file /etc/attraccess-wago/runtime.env \
  --env WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1 \
  --mount type=bind,src=/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din,dst=/run/attraccess-wago/io/din,readonly \
  --mount type=bind,src=/sys/kernel/dout_drv/DOUT_DATA,dst=/run/attraccess-wago/io/dout \
  --mount type=volume,src=attraccess-wago-state,dst=/var/lib/attraccess-wago \
  "$IMAGE"
```

`--restart unless-stopped` starts the runtime after Docker and controller restarts unless an operator explicitly stopped it. It does not make the runtime safe after a failure. Record the command, image digest, environment-file checksum (not its contents), container ID, firmware version, and I/O map review in the deployment record.

Check startup and retain the output:

```sh
docker ps --filter name=attraccess-wago-cc100
docker logs --tail 200 attraccess-wago-cc100
docker inspect --format '{{.State.Status}} {{.RestartCount}}' attraccess-wago-cc100
```

Runtime callback failures are written to container stderr, so `docker logs` is the primary log collection command. Add the output of `docker inspect`, `docker logs`, firmware version, and non-secret configuration metadata to a support bundle. Never include `/etc/attraccess-wago/runtime.env` or `state.json` without removing credentials.

## Enrollment and credentials

The intended enrollment flow is discovery-scoped and one-time:

1. The controller announces its hardware ID, pairing code, protocol/runtime versions, capabilities, and an enrollment secret to `attraccess/wago/discovery/<hardware-id>`.
2. The operator claims it through the corresponding discovery claim topic within the 15-minute enrollment window.
3. Attraccess returns controller-scoped MQTT credentials and operational topic details, then revokes the discovery credential.
4. The controller persists permanent credentials and reconnects with only the controller-scoped identity.

The runtime publishes a retained discovery announcement, subscribes to the claim topic, validates and persists the returned credentials before disconnecting, then reconnects with the permanent controller identity. Subsequent starts use the persisted identity and do not require the discovery identity to remain valid.

On credential compromise, decommissioning, or failed rotation:

1. Revoke the affected broker identity first.
2. Stop the container to prevent repeated failed authentication attempts.
3. Issue a new controller-scoped credential through the Attraccess provisioning process.
4. Replace `WAGO_MQTT_USERNAME` and `WAGO_MQTT_PASSWORD` in the `0600` environment file, and set `WAGO_MQTT_USE_ENV_CREDENTIALS=true` to use the complete replacement pair instead of persisted credentials.
5. Remove the stopped container and recreate it with the same reviewed image digest, state volume, and I/O mapping, using the updated `--env-file`. Docker reads `--env-file` only when creating a container; `docker start` would retain the revoked credentials.
6. Inspect logs and verify a heartbeat under the expected hardware ID.
7. Preserve the persistent volume unless recovery requires discarding the accepted configuration and command history.

## Configuration and operational inspection

With the default prefix, the runtime uses this topic root:

```text
attraccess/wago/v1/controllers/<hardware-id>/
```

It subscribes with QoS 1 to:

- `configuration/desired` for a retained desired snapshot
- `commands` for non-retained commands

It publishes with QoS 1:

- `configuration/reported` retained, including revision, content hash, and structured validation errors
- `state` retained, including connection state, accepted revision/hash, independently measured boolean `inputs`/`outputs`, last `commandedOutputs`, and `readiness`. Configuration acceptance is not hardware readiness. Failed reads omit unavailable values and report errors rather than reporting false. Input changes are sampled every 250 ms; heartbeats refresh state every 30 seconds. Operational messages include timestamp and durable sequence metadata; ATT-978's consumer must ingest the input map.
- `heartbeat` every 30 seconds with hardware ID, pairing code, protocol/runtime versions, capabilities, and a sequence value
- `measurements` every 5 seconds for configured measurement channels
- `faults` when a measurement read or device write fails
- `acknowledgements` for accepted, duplicate, or rejected commands

Desired snapshots are validated before they are persisted. A rejected snapshot publishes field-level errors in Reported Configuration and leaves the last accepted configuration in place. Inspect the retained `configuration/reported` record after every update and compare its revision and hash with Desired Configuration. Do not send commands until the expected configuration is reported.

Use the Attraccess controller detail and diagnostics views as the primary inspection surface. Broker-level topic inspection is restricted to authorised operators because messages can reveal controller topology and operating state.

## Recovery

### Broker loss

The runtime marks state disconnected when its MQTT client closes. Each configured output has a Desired Configuration disconnect policy:

- `hold`: leave the output unchanged
- `immediate`: request an immediate transition off
- `watchdog`: request an off transition after the configured timeout

These are operational controls only, not safety controls. Restore broker connectivity, inspect the retained state and latest heartbeat, then verify the physical outputs before resuming normal operation.

### Invalid configuration

Leave the runtime running. Inspect Reported Configuration for field-level errors, correct the complete Desired Configuration snapshot, and publish a new revision with its matching content hash. A rejected snapshot must not be worked around by manually changing the persistent state file.

### Container crash

```sh
docker ps -a --filter name=attraccess-wago-cc100
docker logs --tail 500 attraccess-wago-cc100
docker inspect --format '{{json .State}}' attraccess-wago-cc100
docker start attraccess-wago-cc100
```

If it repeats, stop it and preserve logs before changing the image or configuration. Check broker reachability, credentials, writable persistent storage, and every configured host I/O path.

### Controller reboot

After the CC100 returns, confirm Docker is active, the container has restarted, and the runtime publishes a new heartbeat. Verify retained state and Reported Configuration before testing I/O. The persistent volume should restore the accepted snapshot and bounded command history; it does not replay acknowledged commands or pulses.

### Roll back an image or configuration

Keep the prior image digest and persistent volume until the replacement has been accepted.

```sh
docker stop attraccess-wago-cc100
docker rm attraccess-wago-cc100
docker run -d \
  --name attraccess-wago-cc100 \
  --restart unless-stopped \
  --privileged \
  --env-file /etc/attraccess-wago/runtime.env \
  --env 'WAGO_IO_PATHS=<previous-reviewed-json>' \
  --mount type=volume,src=attraccess-wago-state,dst=/var/lib/attraccess-wago \
  'ghcr.io/attraccess/wago-cc100-runtime@sha256:<previous-known-good-digest>'
```

Validate the returned image digest, heartbeat, retained configuration, and physical outputs. To roll back configuration, publish the previous complete Desired Configuration snapshot as a new revision; do not edit `state.json` by hand. Only discard the state volume under an approved recovery procedure, because it contains configuration history, command de-duplication data, and potentially credentials.

## Physical verification checklist

Record evidence against [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies); passing this checklist is required before supported-beta release.

- Confirm controller order number `751-9301`, installed firmware, Docker activation, ARMv7 image digest, and persistent restart behaviour.
- Confirm the `879-3000` and `879-1300` assemblies have the intended power, wiring, Modbus settings, address map, readings, rollover handling, and fault reporting once a runtime release selects the Modbus adapters.
- Confirm each configured onboard digital path against the target firmware's sysfs layout. Validate analog/Pt1000 paths and `/etc/calib` only when the runtime implements calibration.
- Confirm `/dev/serial` is the RS-485 interface and that no unrelated serial or device access is granted when RS-485 support is implemented.
- Confirm the final container device list and bind mounts are minimal and document the reason for each one; remove `--privileged` before release.
- Exercise discovery, claim, credential rotation and revocation once the image implements them.
- Exercise Desired/Reported Configuration acceptance, rejection, reconnect, controller reboot, duplicate commands, pulses, guards, feedback, measurements, faults, and disconnect policies.
- Verify that the official emergency-stop and safety circuits remain independent and untouched.

## Sources

- [WAGO CC100 Docker lifecycle](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/config-tools/config_docker_home)
- [WAGO direct onboard I/O access](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md)
- [WAGO CC100 serial interface feature detection](https://github.com/WAGO/cc100-firmware-sdk/blob/main/ptxproj/projectroot/etc/init.d/serial_features)
