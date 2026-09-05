# CC100 Digital Hardware Contract

Status: implemented and software-tested, **not physically validated**. ATT-1056
and ATT-984 remain open. Do not operate production equipment with this artifact.
No runtime behavior is safety-rated.

## Installer Contract

The commissioning service owns deployment; this runtime does not change host
permissions, stop PLC software, or mount hardware itself.

- Verify model `751-9301` and firmware `31` before selecting
  `WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1`.
- Mount only the two files listed in `manifest.json` at their exact container
  destinations. DIN is read-only; DOUT is read-write. Missing sources must fail
  installation, not become directories. No manual `WAGO_IO_PATHS` is supported.
- Run UID 10001, drop all capabilities, enable no-new-privileges. Provision only
  the necessary read access to DIN and read/write access to DOUT on the host.
  The firmware-specific way to grant and preserve this access across reboot is
  still a physical validation gate. Do not fall back to root or privileged mode.
- Ensure a single writer: no concurrent CODESYS program, second runtime
  container, or direct register writer. The runtime lock serializes its own
  writes, not independent host processes.
- Preserve the existing `/var/lib/attraccess-wago` state volume and MQTT
  enrollment contract. Do not mount `/sys`, `/dev`, host root, or Docker socket.
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
by this profile. Modbus, analog, Pt1000 and other firmware profiles are rejected.
Output aliases and duplicate physical addresses are rejected to prevent
conflicting pulse/policy owners. Unsupported snapshots never receive a success
configuration report. Old manually mapped installations must republish the
corrected channel mapping; the runtime does not guess legacy input addresses.

## State Contract

Retained `<prefix>/v1/controllers/<hardwareId>/state` contains:

- `timestamp` (ISO 8601) and `sequence` (durably reserved monotonic integer).
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

ATT-978's consumer must parse boolean `inputs` as well as `outputs`, invalidate
missing/unavailable channels, and expose their changes to flows. Its current
open PR parses only `outputs`. The timestamp/sequence envelope also applies to
measurements, faults and acknowledgements. ATT-978 and simulator PR #1797 touch
runtime publication; integrate without replacing main's command expiry,
revision guard, configuration barrier, or pulse-shutdown retry behavior.

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
