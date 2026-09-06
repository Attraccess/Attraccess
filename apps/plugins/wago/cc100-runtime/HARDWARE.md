# CC100 Digital Hardware Contract

Status: implemented, **not physically validated**. Software evidence applies only
to its recorded source snapshot, not later security revisions. ATT-1056
and ATT-984 remain open. Do not operate production equipment with this artifact.
No runtime behavior is safety-rated.

## Installer Contract

The commissioning service owns deployment; this runtime does not change host
permissions, stop PLC software, or mount hardware itself.

- Commissioning is destructive as of 2026-09-06: existing applications/workloads
  may stop working or be erased. Attraccess does not preserve, back up, or restore
  preexisting CODESYS programs or other workloads. The installer must always stop
  and permanently disable CODESYS, then verify its process and boot state before
  granting I/O access. Failure must block runtime launch.
- Verify model `751-9301` and firmware `31` before selecting
  `WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1`.
- Mount only the two files listed in `manifest.json` at their exact container
  destinations. DIN is read-only; DOUT is read-write. Missing sources must fail
  installation, not become directories. No manual `WAGO_IO_PATHS` is supported.
- Run UID 10001, drop all capabilities, enable no-new-privileges. Provision only
  the necessary read access to DIN and read/write access to DOUT on the host.
  The installer persists this narrow grant through a supported boot hook. It must
  recheck CODESYS disablement and register access before starting Attraccess after
  reboot; failure blocks startup. Physical persistence/reboot validation remains
  required. Do not fall back to root or privileged mode.
- Ensure a single writer: no concurrent CODESYS program, second runtime
  container, or direct register writer. The runtime lock serializes its own
  writes, not independent host processes. The installer/host supervisor rejects
  UID/GID 10001 account or group collisions, unrelated processes using that
  identity, unverified user-namespace mappings, and unowned open writable DOUT
  descriptors, including aliases to the same inode. Owned-process exemptions
  require the full Docker ID, namespace mapping and cgroup. Unknown observations
  block startup. Repeated checks cannot prevent every privileged host race.
- Keep accepted runtime state in `/var/lib/attraccess-wago` across ordinary
  runtime restarts. A new enrollment uses fresh storage and credentials; cleanup
  is not a backup or restoration of preexisting workloads. Do not mount `/sys`,
  `/dev`, host root, or Docker socket.
- Guided deployment uses Docker restart policy `no`. The root-owned boot hook
  `/etc/rc.d/S99_zz_attraccess_wago start` starts host supervision, which repeats
  the complete gate before each of at most five crash restarts per supervisor
  run and periodically checks a running writer. Failed observation, conflict or
  retry exhaustion disables runtime enablement and attempts bounded containment.
  Unverified stopping remains a failure requiring recovery. After an ordinary
  daemon-only restart, the supervisor or checked hook can resume only while
  enablement remains present. Containment removes that enablement; hook `start`
  then exits `0` without starting anything, and reboot does not clear the latch.
  Resolve the cause and use the [wizard cleanup/recommissioning route](../../../../docs/en/devices/wago-cc100-commissioning.md#recover-after-latched-containment).
  Only installation recreates enablement. Do not recreate its marker manually or
  start the container directly with Docker. This corrects the earlier hook-only
  recovery instruction and supersedes the intermediate restart policy
  recorded in the [2026-09-06 decision ledger](../../../../docs/en/devices/wago-fw31-support.md#security-follow-up-on-2026-09-06).
- Require root-owned, restrictive configuration/lock paths and validated boot-hook
  publication. Before I/O, verify CODESYS processes are absent, runtime selection
  is `0`, standard and alternative enabled PLC boot entries are absent, and the
  executable Docker boot entry resolves to the expected vendor daemon script.
- Cleanup must verify the owned runtime is stopped or absent. An unavailable
  Docker daemon does not establish this; failed verification retains the error
  and recovery ownership. Cleanup never re-enables CODESYS or restores old workloads.
- Check retained `state.readiness` after deployment, not only
  `configuration/reported`. Readiness is a current software probe, not proof of
  correct wiring or relay operation. An actual command can still fail after a
  successful probe.

## Configuration Contract

Configuration-v1 keeps `{ id, hardwareProfile: '751-9301', channel }` physical
points. Flat indices are deliberately unambiguous without an extra direction
field. `src/onboard-profile.ts` is the editor/installer reference:

| Channel | Name     | Direction | Packed Bit        |
| ------- | -------- | --------- | ----------------- |
| 0..3    | DO1..DO4 | output    | 0..3 in DOUT_DATA |
| 4..11   | DI1..DI8 | input     | 0..7 in din       |

Logical capabilities must agree with direction. Only digital I/O is implemented
by this profile. Analog, Pt1000 and other onboard firmware profiles are rejected.
The production router separately supports explicitly configured Modbus points;
those points are not mapped onto the onboard digital registers. The built-in
Modbus device profiles remain unqualified pending isolated hardware evidence.
Output aliases and duplicate physical addresses are rejected to prevent
conflicting pulse/policy owners, including overlapping Modbus holding registers
across named actions and device aliases. Modbus register inputs require the
`measurement` capability and a matching named measurement transform; input-only
register channels are rejected at both backend and runtime boundaries. Unsupported snapshots never receive a success
configuration report. Old manually mapped installations must republish the
corrected channel mapping; the runtime does not guess legacy input addresses.

## State Contract

Retained `<prefix>/v1/controllers/<hardwareId>/state` contains:

- `timestamp` (ISO 8601), per-boot `streamId`, and per-category `sequence`
  (contiguous within a running stream, durably reserved across restarts).
- `connected`, accepted `revision` and `contentHash`.
- `inputs`: logical input ID to boolean, independently extracted from each bit.
- `outputs`: logical output ID to boolean read from the output register.
- `commandedOutputs`: last successfully commanded values, not measured values.
- `readiness`: `configurationAccepted`, `hardwareAvailable`, `ready`, `errors`.

Read failures omit the corresponding value rather than publishing false or a
stale cached value. Errors include actionable mount/permission guidance and
per-channel `digital_read_failed` faults. Successful configuration acceptance
does not imply hardware availability. Input/output polling runs every 250 ms,
publishes changed state only, and does not overlap. Heartbeats refresh state
every 30 seconds. This is sampled state, not an edge-capture guarantee; pulses
shorter than the sampling interval may be missed.

The composed flow consumer parses boolean `inputs` and `outputs`, invalidates
missing/unavailable channels, and exposes their changes to flows. The canonical
envelope also applies to heartbeats, measurements, faults and acknowledgements.
The production runtime and simulator share this publication contract, command
expiry, revision guards, configuration barriers and pulse-shutdown retries.
Command expiry is rechecked at write admission after storage, guard reads and
I/O queues. Pulse shutdown obligations are saved before ON is attempted. Restart
schedules immediate OFF recovery using the locked accepted configuration, with
retries until shutdown and its durable state update succeed.

## Evidence And Limitations

WAGO's [direct I/O guide](https://github.com/WAGO/cc100-howtos/blob/main/HowTo_Access_Onboard_IO/README.md)
documents both sysfs paths, packed access, decimal values and LSB = DI1/DO1.
The [751-9301 product page](https://www.wago.com/global/controllers/compact-controller-100/p/751-9301)
specifies 8DI/4DO. This establishes the documented layout, not physical FW31
evidence. Tests use temporary files and synthetic register bytes only.

Physical startup/reboot, disconnect, pulse completion/retry, duplicate commands,
guards/feedback and all configured policies remain to be exercised on isolated
test loads. Confirm minimum persistent permissions and exclusive ownership,
capture image digest and hardware evidence in ATT-984, and only then release.
