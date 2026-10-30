# WAGO production support and compatibility

> **Physical use is unqualified until [ATT-984](https://linear.app/attraccess/issue/ATT-984/validate-the-four-wago-package-assemblies).**
> Nothing on this page is a safety claim or a hardware qualification. Read the
> [safety boundary](wago-safety-boundary.md) first. A penetration test and an external safety review have **not**
> been performed ([threat model](wago-threat-model.md)).

This page states what has been tested, what to configure, what was measured, and what is not promised.

## Tested compatibility

| Item | Value | Status |
| --- | --- | --- |
| Controller | WAGO CC100 `751-9301` | Software fixtures and the lab exercises below; hardware acceptance is ATT-984 |
| Firmware | FW31 (BSP `2024.12.0` alone does not identify it, see [FW31 support](wago-fw31-support.md)) | Baseline |
| Runtime version | `0.3.0` (`runtimeVersion` in `cc100-runtime/manifest.json`) | Current |
| Protocol | `1.0.0`, major version 1 | Current |
| Hardware profile | `cc100-751-9301-fw31-digital-rtu-v1` (legacy `digital-v1` releases are digital-only) | Current |
| Runtime capabilities | `claim`, `claim-expiry-v1`, `heartbeat`, `configuration-v1`, `commands`, `state`, `measurement`, `fault`, `acknowledgement`, `credential-rotation-v1`, `front-panel-v1`, `runtime-update-gate-v1`, `bounded-messages-v1` | Current; a test keeps this list equal to the runtime's |
| Attraccess host | plugin SDK `attraccessVersion.min` `1.11.0` (`plugin.json`); no upper bound declared | Current |
| Broker | RabbitMQ 4 with the MQTT plugin | Reliability harness and fleet fixture |

### Modbus profiles

| Profile | Status |
| --- | --- |
| WAGO 879-3020 (4PS), Modbus RTU | Read-only measurements; complete readable register map; connection settings in [879-3020 over RS-485](wago-879-3020-modbus-rtu.md). Not hardware-qualified |
| WAGO 879-3000 | Legacy; kept loadable, not hardware-qualified |
| `879-3000` and `879-1300` "unverified" | Legacy references, named **UNQUALIFIED / map unverified** in the editor |

### Mixed versions

An older runtime keeps working with a newer server, and the other way round. A runtime without
`bounded-messages-v1` shows no drop counters (the diagnostics say so), sends no `omittedErrors`, and is not subject
to the new message caps. Configuration limits apply when a new revision or rollback is published and when a runtime
that has them receives one; a configuration that is already running is never refused for them.

A managed runtime updates automatically after the server is updated, with outputs off until the server confirms the
running image. An unmanaged runtime stays in failsafe until it is updated by hand
([runbook 5](wago-recovery-runbooks.md#5-runtime-upgrade-and-rollback)).

## Broker settings

- **One account per controller**, with the topic policy the enrollment flow requests (publish under its own
  `controllers/<hardwareId>/#`; subscribe only to its desired configuration, commands and credential rotation).
- **QoS 1** for controller publish and subscribe; the server record's defaults may stay at QoS 0.
- **Maximum message size: 2 MiB** (recommended). The largest legitimate message is a 1 MiB desired
  configuration. For RabbitMQ 4 set the MQTT packet-size limit for authenticated clients (for example
  `mqtt.max_packet_size_authenticated = 2097152`; check the key name against your RabbitMQ version's documentation).
  The Attraccess host does not cap MQTT message size itself, so this limit is the only host-side protection against a
  single oversized publish.
- Keep retained messages enabled: controllers publish retained state and reports, and the server publishes retained
  desired configurations.

## Limits the integration enforces

| Limit | Value | What happens beyond it |
| --- | --- | --- |
| Controller to server messages | 64 KiB, 8 nesting levels | Ignored before parsing |
| Commands, claims, rotation messages to a controller | 64 KiB | Dropped, counted, no reply; the sender times out |
| Desired configuration to a controller | 1 MiB | Dropped, counted, no reply |
| Messages handled at once per subscription | 100, plus 100 waiting | Further messages dropped, counted, no reply |
| Rejection report | 50 errors, 64 KiB | Truncated, with a count of omitted errors |
| Readiness errors in the status message | 8 KiB | Truncated, with a count of omitted errors |
| Fault text | 1 KiB | Truncated |
| Configuration size | 1 MiB (whole desired message) | Refused at publish, rollback and on the controller |
| Configuration nesting | 16 levels | Refused |
| ID length | 256 characters, no control characters | Refused |
| Channels or physical points | 256 each | Refused |
| Worst-case status report | 64 KiB | Refused |

A dropped command gets no reply, so it times out like a command to an offline controller. The drop counts by reason
(`oversized`, `overload`) are shown in the controller diagnostics.

## Measured limits

Every figure below is a **simulator measurement**: the real server plugin on the host's real MQTT services against a
RabbitMQ 4 container, with simulated controllers in another process. It says nothing about a physical CC100, and each
figure is only valid for the commit, machine, broker and duration recorded with it.

Published limits are **half the highest passing step** of the sweep (1 to 128 controllers at 1 command/s per
controller, then a rising rate, five minutes per step). Recovery targets are **twice the slowest measured recovery**.
Run it with `pnpm nx run plugin-wago:reliability:sweep`; a quick check with `reliability:short`.

> **No sweep results are published yet.** The sweep takes about an hour on a quiet machine and has not been run on
> one. No limit or recovery target is stated here until it has. The 8-hour soak run is documented but not performed.

### Pass criteria

| Mode | Fails on |
| --- | --- |
| Short (about 3 minutes, 4 controllers, each failure once) | a lost command, lost state, a host queue drop, or a recovery over 180 s; also a command applied twice |
| Sweep step | any of the above, a controller drop, or a 95th-percentile acknowledgement over 2 s |

### Failures injected

Broker outage (30 s), connection loss, runtime restart, server restart with saved state, duplicate commands,
out-of-order state, oversized messages, rejected configurations, and credential rotation under load. The credential
rotation keeps the broker account unchanged, so it exercises the handoff, persistence and reconnect, not a broker
password change.

## Runbooks

[Recovery runbooks](wago-recovery-runbooks.md): configuration and runtime recovery, credential compromise, broker
outage, controller replacement, runtime upgrade and rollback, disaster recovery. Commissioning is destructive and
there is no workload backup or restore.

## Lab exercises

The recovery runbooks and the upgrade and rollback, broker-outage, credential-rotation and controller-replacement
exercises (including a destructive commissioning) are run on a real CC100 `751-9301` with FW31 and a person present.

> **Not yet performed.** They need a prepared CC100 and a person to run them. Results are added to this table, and
> the evidence recorded against the [evidence guide](wago-acceptance-evidence.md), before the change leaves draft.

**Preconditions.** A CC100 that may be wiped, with no connected equipment (or only safe low-voltage fixtures), a
reachable private IPv4 address, the factory or known SSH login, and a RabbitMQ 4 broker with an administrator
account. Record the commit, runtime version, firmware, broker version and operator.

| # | Exercise | Steps | Pass when | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| L1 | Destructive commissioning | Run the [guided workflow](wago-cc100-commissioning.md) on the unit | Fresh heartbeat, configuration applied, enrollment revoked; CODESYS stopped and disabled | not run | |
| L2 | Runtime upgrade | Install the previous runtime, then let the managed update install the current one | Outputs off until confirmed; ready afterwards from the same boot | not run | |
| L3 | Runtime rollback | Force a failing candidate image | Previous image restored; status shows the classified reason | not run | |
| L4 | Unmanaged runtime after server update | Leave an unmanaged unit on the old runtime | Outputs off, commands refused, until it is updated by hand | not run | |
| L5 | Broker outage | Stop the broker for 30 s, then 5 min | Disconnect policy applied; recovery within 180 s; state matches | not run | |
| L6 | Credential rotation | Rotate under command load | Completed; commands still acknowledged | not run | |
| L7 | Controller replacement | Replace the unit, copy the configuration, republish | New unit ready; old registration removed | not run | |
| L8 | Oversized and excess messages | Publish a 70 KiB command and 150 commands at once | Counters rise in diagnostics; the unit stays ready | not run | |

Evidence template for each row: date, operator, commit, runtime version, firmware, broker version, steps taken,
observed result, screenshots or log excerpts (without secrets), and anything that differed from the runbook.

## Support boundaries

- This is a beta integration. There are **no fixed response times, availability targets or maintenance periods**.
- Supported means: the combination listed under tested compatibility, installed through the guided commissioning
  workflow, with the safety circuits independent of Attraccess.
- Not supported: other CC100 models or firmware, the manual Docker installation as a production path, deploying
  without the guided workflow, using the integration as a safety function, and restoring a controller's previous
  workload.
- Deferred and not advertised: qualification of all four package assemblies, billing, telemetry history and
  arbitration.
- Open: the penetration test, the external safety review, the 8-hour run, and hardware acceptance (ATT-984).
