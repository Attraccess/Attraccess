# Modbus integration (ATT-1059)

This implementation provides configurable Modbus TCP and POSIX RTU acquisition and
binary named actions. **No device, controller, firmware, or register map is hardware
qualified.** Do not use the existence of a built-in profile as a support claim.

## Configuration and shared editor integration

`model.ts` is the pure shared model used by backend validation, the frontend form,
and the standalone runtime. Persist `snapshot.modbus` alongside physical points and
logical channels through the existing configuration draft/revision APIs. There is
no Modbus environment JSON. Configuration uses three arrays (maximum 64 each):

- `connections`: ID, timeout (10–60000 ms), reconnect delay (0–60000 ms), FIFO limit
  (1–128 including the active transaction), and either TCP host/port or RTU path,
  baud rate, parity, and stop bits. Devices on one endpoint share one connection.
- `devices`: name, ID, connection ID, unit ID (1–247; broadcasts rejected), exact
  profile ID and version. Multiple units share the same transport queue.
- `profiles`: custom profiles with versioned, named measurements and actions.
  Built-in IDs cannot be overridden. Duplicate a built-in to edit its map.

The ATT-1058 owner can import these exports from
`frontend/src/ModbusConfigurationForm.tsx`:

```tsx
<ModbusConfigurationForm
  value={snapshot.modbus ?? { connections: [], devices: [], profiles: [] }}
  onChange={(modbus) => setSnapshot({ ...snapshot, modbus })}
  isDisabled={saving}
/>
```

`ModbusProfileForm` accepts `{ value: ModbusProfile, onChange, isDisabled? }`.
It renders editable named measurements/actions, numeric fields, selects, and
read-only built-ins. `ModbusPointForm` accepts
`{ configuration: ModbusConfiguration, value: ModbusPoint, onChange, isDisabled? }`.
It selects a device and named measurement/action. Persist the binding as
`physicalPoint.modbus = { deviceId, measurementId?, actionId? }`, with
`hardwareProfile: 'modbus'` and `channel: 0` (channel is not a register address).
Measurement channels must use the profile's physical unit/kind with logical
`scale: 1, offset: 0`; the profile applies register scaling once. Output channels
require a named action. `validateModbus` and `validateModbusBindings` return
`{ path, code, message }[]`; disable the host editor's save/apply actions while
the full snapshot has errors. Removing or renaming referenced entries intentionally
produces reference errors until the editor repairs the bindings.

The shared controller editor has deliberately not been modified. Until ATT-1058
mounts these exports, these forms are not reachable from that editor. Profile
versions are embedded in each configuration revision; update device references
when changing a custom profile version. Custom profiles are not globally shared
between controllers.

## Registers, values and actions

Addresses are explicit decimal numbers with `addressBase: 0 | 1`. Zero-based
addresses are sent unchanged; one-based addresses subtract exactly one. A value
such as 40001 is not implicitly converted to a holding-register offset. Choose
FC03 (holding registers) or FC04 (input registers) explicitly. `uint16`, `int16`,
`uint32`, `int32`, and IEEE float32 have explicit byte and word order. Scaling is
`raw * scale + offset`, yielding persisted engineering units A/V/W/Wh/percent.
Non-finite values fault instead of becoming fabricated samples.

Actions map runtime boolean commands to explicit `onValue`/`offValue` in physical
units. FC05 requires 0/1, identity scaling and uint16; FC06 writes one 16-bit
register; FC16 writes one or two registers according to dtype. Values that cannot
be represented are rejected. Write echoes are checked for address, value/count,
function, unit, and transaction/CRC. No failed write is automatically replayed.
Other functions and arbitrary numeric runtime commands are not supported.

The merged ATT-979 correction (`73995720`, PR1796) supplies MQTT encoding: safe
integer milliampere, millivolt, milliwatt, milliwatt-hour and millipercent values,
with exact safe whole-unit fallback only on milli-range overflow. Persisted
configuration transforms stay in physical units. This module returns engineering
values and does not multiply by 1000 itself.

`acquireMeasurements(snapshot, device)` yields all bound `channels` with either
`raw` and an ISO `timestamp` captured immediately after the read completes, or
the original `error`. The runtime preserves this acquisition/fanout hook, calls
`encodeMeasurement(channel.id, raw, transform)`, then publishes through
`publishOperational('measurements', measurement, undefined, timestamp)`.
The category envelope supplies a per-boot UUID stream and separate sequences for
state, measurements, faults and acknowledgements. `measurementErrorCode(error)`
preserves both `MeasurementContractError.code` and transport codes such as
`modbus_rtu_quarantined`. Publication delays do not change the acquisition timestamp.

Polling intervals are best-effort minimum intervals (100–3600000 ms), checked by
the runtime's 100 ms scheduler. Onboard reads retain a 5 s minimum. Only one
measurement sweep runs at a time; a shared physical source is read once and the
same sample and timestamp are published to every bound logical channel. There is
no sample reuse between sweeps; duplicate in-flight acquisition is rejected;
bus queues have hard limits. A slow bus can delay other measurements in the
sweep. Failures publish runtime measurement faults and never publish cached data
as fresh. Configuration changes discard stale in-flight measurement results.

Cumulative counters fault on any decrease unless an explicit raw rollover
modulus is configured. A rollover is accepted only from the top 10% to the bottom
10% of that modulus; a mid-range decrease faults as a reset. This heuristic cannot
distinguish a reset at the boundary or recover multiple wraps between samples.
Unchanged physical sources retain totals, decrease-fault history, and polling
deadlines across revisions, including name, profile version and polling-interval
changes. Identity includes endpoint/framing, unit, function, wire address, dtype,
ordering, scaling, physical unit, kind and rollover modulus. Removed or changed
sources get a new baseline; runtime restart also resets history. These totals
are not a durable energy ledger. No built-in declares rollover.

Configuration routing is prepared without mutation, then I/O is suspended and
queued transactions are invalidated while the candidate snapshot is persisted.
The snapshot and routing table are installed synchronously only after save
succeeds. Save failure resumes the old pair. Commands received during persistence
are rejected. Pending commands, active pulses and energized outputs prevent a
production routing change; finish commands and switch outputs off first so a
timed OFF cannot lose its old route. No implicit actuator writes are performed
to make a configuration apply succeed.

For adapters with `prepareConfiguration` (the production router), every output
write first marks its logical channel ID uncertain in memory using the optional
runtime state field `uncertainOutputChannelIds`. Older state files without the
field mean an empty set. ON requires this uncertainty to be persisted before
transmission; a failed save prevents ON transmission. OFF skips this write-ahead
save so storage failure cannot suppress automatic disconnect or pulse shutoff.
Previously durable energized/uncertain state remains conservative across restart
until an OFF confirmation is successfully persisted. Command reservation
persistence for explicit commands is unchanged.
A write failure leaves uncertainty intact without changing the last-confirmed
`outputs` value or acknowledging success. New desired revisions are rejected with
the structured `outputs_busy` error while any output is uncertain, including
after restart, so removal or rebinding cannot discard a possibly energized route.
A confirmed write clears that channel's uncertainty; if saving the confirmation
fails, the runtime conservatively restores uncertainty in memory. Successful ON
still blocks configuration through the energized-output guard. A successful,
persisted explicit OFF on the old route allows reconfiguration once no other
outputs or commands are busy. Restart performs no output replay, and this change
adds no write retry or implicit OFF. Legacy adapters without the production
configuration-preparation seam retain their existing write/persistence behavior.

## Transports and deployment

TCP uses a new socket per transaction, a bounded deadline including connection,
MBAP transaction/protocol/unit/length validation, segmented response assembly,
read byte-count validation, and Modbus exception handling. A later request opens
a new connection after the configured reconnect delay. There is no write retry.

RTU sends and validates full unit/PDU/CRC frames. Production uses `python3` and
POSIX standard-library `termios`, `select`, and advisory device locking (Python
is installed in the runtime Docker image). It sets raw 8-bit baud/parity/stop
framing, flushes stale input, observes at least 3.5 character times before sending,
and bounds the caller's wait. On timeout it aborts the child but retains ownership
until the process emits `close`; an injected exchange must likewise settle only
after teardown and should observe its optional `AbortSignal`.

**RTU timeout or ambiguous framing/CRC/transport failure quarantines that serial
endpoint for the rest of the process lifetime**, across new transport instances
and configuration revisions. Queued and new requests fail immediately with
`modbus_rtu_quarantined`, even if teardown never finishes. Late valid-looking
frames are discarded. There is no automatic retry, reconnect, unquarantine API,
or claim of safe resynchronization: RTU has no transaction ID and a delayed reply
to a different same-width address cannot be distinguished. Before restarting a
quarantined runtime, externally isolate/reset and establish a quiescent bus;
merely restarting the process or changing the configured path is not proof of
safe resynchronization. A valid protocol exception completes its transaction
and does not by itself quarantine the bus. No RTU reconnect has been proven.

RTU configuration requires a lexically canonical `/dev/...` path: no repeated
slashes, `.` or `..` segments, or trailing slash. Transport bus keys additionally
use POSIX lexical normalization so direct construction cannot evade an existing
queue or quarantine with these aliases. This does not resolve symlinks or identify
device nodes: distinct symlink paths to the same device can still bypass shared
queue/quarantine identity. Use one consistent path per physical bus across all
configurations; changing aliases is not a recovery mechanism. No filesystem
discovery, realpath lookup, or additional device access is performed.

Failure to open/configure/lock/read the serial device faults. Grant the runtime UID only the required serial device and
its group; device discovery and RS-485 direction control are not configured here.
The adapter assumes the serial driver/hardware handles RS-485 transmit direction.
This must be checked on the actual CC100 before qualification.

`QueuedModbusTransport(connection, serialExchange?)` supports injected serial
fixtures. `ModbusDeviceRouter(onboardAdapter, transportFactory?)` is the production
routing seam and leaves onboard adapter implementation with ATT-1056. The legacy
Modbus classes in `adapters.ts` are not used by production routing.

## Built-in evidence and qualification gates

The user's ATT-979 evidence identifies official documents:

- 879-3000: https://www.wago.com/us/d/5937710
- 879-1300: https://www.wago.com/us/d/18838796

Both links failed to load during this implementation. The candidate maps use the
supplied RTU FC03 wire addresses: `0x5012` float kW active power, `0x600C` imported
energy, `0x6018` exported energy. Energy is float kWh for 879-3000 and uint32 Wh
for 879-1300. Big byte/word order is an **unverified assumption**, not a confirmed
manual fact. Built-ins are version 1, frozen, read-only, explicitly labelled
UNQUALIFIED / map unverified, and have no outputs or rollover assumption.

Before release: mount/visually verify forms with ATT-1058, independently verify
manuals and byte/word order, and qualify RTU/TCP on actual hardware
with a complete backup. No hardware operation or hardware proof was performed.

Fleet reported socket-enabled validation of `df46d31f` passing 90 runtime/Modbus
tests (including the real TCP fixtures), 89 backend tests, and 106 generator-hook
tests. These are software/fixture results, not hardware qualification or proof
of RTU reconnect. Focused post-merge tests also cover the corrected encoding,
acquisition timestamps, category envelopes and typed faults.

Tests: `backend/modbus-configuration.spec.ts` validates persisted models/bindings;
`cc100-runtime/src/modbus/modbus.spec.ts` contains actual loopback TCP fixtures,
injected RTU CRC/echo/exception fixtures, multi-unit bus serialization, bounded
queues/acquisition, codec order/scaling, and cumulative/reset tests. Socket tests
must fail visibly if the environment denies listening; they are not hardware proof.
