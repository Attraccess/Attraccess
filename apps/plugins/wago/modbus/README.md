# Modbus integration (ATT-1059)

This implementation provides configurable Modbus TCP and POSIX RTU acquisition and
binary named actions. WAGO 879-3020 (4PS) is the only predefined device profile.
Its complete read-only register map follows the WAGO meter manual. See
[setup and evidence](../../../../docs/en/devices/wago-879-3020-modbus-rtu.md).
Communication evidence does not qualify loaded energy accuracy or every physical assembly.

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
`frontend/src/configuration/modbus/ConfigurationForm.tsx`:

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

The shared controller editor mounts these forms under **External devices**. Profile
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
Non-finite values fault instead of becoming fabricated samples. An optional
measurement `decimalPlaces` (0-3) explicitly rounds engineering values before MQTT
encoding. Without it, values retain their exact semantics. The 879-3020 profile
uses three places to handle IEEE float32 approximation while emitting integer
milli-units. Other predefined profiles have been removed; published configurations
referencing them must be moved to the exact meter profile or an explicit custom map.

Actions map runtime boolean commands to explicit `onValue`/`offValue` in physical
units. FC05 requires 0/1, identity scaling and uint16; FC06 writes one 16-bit
register; FC16 writes one or two registers according to dtype. Values that cannot
be represented are rejected. Write echoes are checked for address, value/count,
function, unit, and transaction/CRC. No failed write is automatically replayed.
Other functions and arbitrary numeric runtime commands are not supported.

The shared measurement contract owns MQTT encoding (safe integer milliampere,
millivolt, milliwatt, milliwatt-hour, millipercent; source timestamp; per-boot UUID
stream; per-category sequences). The Modbus adapter returns engineering values;
profile scaling such as kW to W is applied once, before wire encoding.

The acquisition hook is `acquireMeasurements(snapshot, device)`: each yielded
result contains all bound `channels`, either `raw` and an ISO `timestamp` captured
immediately after the read completes, or the original `error`. The runtime passes
that timestamp through publication. `measurementErrorCode(error)` preserves
measurement-contract and transport codes, including `modbus_rtu_quarantined`.

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
are rejected. Already admitted writes finish before routing is installed. Output
levels and uncertain output states do not prevent configuration changes. The
front panel always asks for confirmation and shows current reported HIGH/LOW
levels, or unavailable states, without inferring what the connected machine does.
Applying does not write outputs. Active pulses retain their duration and captured
physical route; their original shutdown route is persisted in `pendingPulseRoutes`
so completion and restart recovery still reach the original device after removal
or rebinding. A new explicit command on that same physical route supersedes its
pending pulse.

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
`outputs` value or acknowledging success. A confirmed write clears that channel's
uncertainty; if saving the confirmation fails, the runtime conservatively restores
uncertainty in memory. These diagnostic states do not block configuration changes.
Restart performs no switched-output replay. Scheduled pulse completion and the
configured disconnect behavior remain explicit output actions.

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
endpoint** across new transport instances and configuration revisions. Queued and
new requests fail immediately with `modbus_rtu_quarantined`, even if teardown never
finishes. Late valid-looking frames are discarded. RTU has no transaction ID, so a
delayed reply to a different same-width address cannot be distinguished from a fresh
one. A valid protocol exception completes its transaction and does not quarantine
the bus.

Recovery depends on what failed:

- **A failed read self-heals.** Reads are idempotent. After a quiet period
  (`max(2 * timeoutMs, reconnectMs)`, so any late reply has already arrived) the
  runtime sends a current read as a probe, using the latest configured framing,
  unit and register map; the serial exchange flushes
  stale input and waits 3.5 character times first. Only a reply that passes
  unit/CRC/length and function/byte-count validation lifts the quarantine. A failed
  probe doubles the wait (capped at 60 s). Meanwhile requests keep failing fast
  with `modbus_rtu_quarantined`, so a dead meter is visible rather than silent.
- **A failed write never self-heals.** The command may have reached the device and
  must not be replayed or raced by a probe. The quarantine lasts for the process
  lifetime: externally isolate/reset and establish a quiescent bus before
  restarting the runtime. Changing the configured path is not a recovery mechanism.

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

The production entry point selects `ModbusDeviceRouter` for the
`cc100-751-9301-fw31-digital-rtu-v1` deployment. That release maps the onboard UART
and preserves the firmware's dialout ownership; the runtime uses `/dev/serial`.
The scheduler ticks every 100 ms while the router enforces per-signal intervals.

`QueuedModbusTransport(connection, serialExchange?)` supports injected serial
fixtures. `ModbusDeviceRouter(onboardAdapter, transportFactory?)` is the production
routing seam and leaves onboard adapter implementation with ATT-1056. The legacy
Modbus classes in `adapters.ts` are not used by production routing.

## Built-in evidence and qualification gates

The sole built-in is `wago-879-3020`, version 1, for the WAGO 879-3020 (4PS):
https://www.wago.com/de/energiemesstechnik/energiezaehler-mid/p/879-3020

The WAGO 4PU/4PS/2PU CT product manual V1.6, appendix A3.2, pages 34–38,
documents the 131 non-reserved readable values. `wago-879-3020.ts` supplies the
complete map: all phase/total electrical quantities, frequency, line voltages,
active/reactive and Q1–Q4 energy by phase/tariff, resettable day counters, and
meter information/settings. The original five IDs and engineering transforms
remain compatible with existing version 1 snapshots.

The shared measurement contract carries Hz, var, VA, varh, ratios, numbers/codes,
seconds and imp/kWh alongside the original units. Canonical MQTT values remain
integer milli-units (or exact whole units on safe milli-range overflow). Metadata
codes include read-only display hints; every register can be bound to a channel.
The adapter batches adjacent values in bounded 120-word requests, preserves each
block's actual completion time, and isolates valid illegal-register exceptions.
No timeout/CRC retry or measurement cache is introduced by batching.

The meter must use standard float data format (`0x4026 = 1`). The profile has
no write actions and declares no rollover. Resettable/net energy uses live
measurements; dedicated import/export energy remains cumulative.
Appendix A3.1 specifies unit 1, 9600 baud and 8E1 as the factory settings;
always match the actual meter. The previous 879-3000 and unverified
879-3000/879-1300 catalog entries have been removed. Custom profiles remain available.

Remaining acceptance includes loaded power/energy accuracy, physical disconnect
and fault scenarios, other meter models, and TCP hardware. Development-device
reads and integrated software checks do not establish those broader claims.

Tests: `backend/configuration/modbus-configuration.spec.ts` validates persisted models/bindings;
`cc100-runtime/src/modbus/modbus.spec.ts` contains actual loopback TCP fixtures,
injected RTU CRC/echo/exception fixtures, multi-unit bus serialization, bounded
queues/acquisition, codec order/scaling, and cumulative/reset tests. Socket tests
must fail visibly if the environment denies listening; they are not hardware proof.
