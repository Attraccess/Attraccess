# WAGO 879-3020 (4PS) over CC100 RS-485

The CC100 runtime supports read-only measurements from the WAGO 879-3020 (4PS) over its
two-wire RS-485 interface. Select the **WAGO 879-3020 (4PS) — Modbus RTU** device profile.

## Connection

The [WAGO 4PU/4PS/2PU CT manual, V1.6](https://www.tme.eu/Document/cb78e7d2f399e5b3e36d23003a167a48/879-3020-en.pdf), appendix 3,
documents these factory settings:

| Setting            | Value         |
| ------------------ | ------------- |
| Transport          | Modbus RTU    |
| CC100 serial path  | `/dev/serial` |
| Slave/unit address | `1`           |
| Baud rate          | `9600`        |
| Data bits          | `8`           |
| Parity             | Even          |
| Stop bits          | `1`           |

Meter terminals 7 and 8 are the RS-485 connection. Follow the meter and CC100
terminal markings for polarity and the manual's bus termination requirements.
Use the meter's actual settings if they have been changed.

## Runtime release

Install a release declaring hardware profile
`cc100-751-9301-fw31-digital-rtu-v1`. Legacy `digital-v1` releases retain their
digital-only deployment and do not provide serial access.

The installer checks the root-owned `/dev/serial` alias to `/dev/ttySTM1`, the
character device's root/dialout ownership and `0660` permissions, and the firmware's
RS-485 boot configuration. It maps only that device, read/write, into the container
as `/dev/serial`, and adds its existing host dialout GID to UID 10001. The runtime
remains unprivileged, drops all capabilities, and uses the existing supervised
startup checks. Serial checks run again before supervised starts.

On the development FW31 device, the STM32 UART reports RS-485 enabled with kernel
direction control and 1 ms delays before and after sending. The transport uses the
firmware's direction control; it does not toggle GPIOs or require privileged mode.

## Configure measurements

1. Open the controller's **Configure** page, then **External devices**.
2. Add an RTU connection using the settings above. Start with a 2000 ms response
   timeout and one shared connection for the RS-485 bus.
3. Add the meter with unit address 1 and profile **WAGO 879-3020 (4PS) — Modbus RTU**.
4. Add measurement channels bound to the signals you need. On the **Inputs & outputs** page,
   **Add Modbus device** creates every channel at once with the recommended readings enabled (see
   [Default readings](#default-readings-and-enabling-more)).
5. Save, review, and publish. Wait for the revision to be applied, then inspect
   fresh measurements in **Diagnostics**.

The profile exposes all 131 documented, non-reserved FC03 values from appendix
A3.2, pages 34–38. The controller front panel groups them into expandable sections:

- Electrical measurements: voltage, current, active/reactive/apparent power and
  power factor for L1, L2 and L3, totals, frequency and phase-to-phase voltages.
- Active and reactive energy: total, imported and exported counters, all four
  tariffs, phase counters and resettable day counters.
- Quadrant energy: Q1–Q4 totals and their tariff counters.
- Meter information: serial/type codes, firmware/hardware/protocol versions,
  communication settings, phase directions/quadrants, checksums, status words,
  tariff, S0 settings and display settings.

Each value is a named measurement channel, available to diagnostics and flows.
Existing five-channel configurations retain their identities and transforms;
resaving the device adds the missing channels; which ones and whether they are enabled depends on
the CC100 runtime (see the rules below). The profile has no write actions.
Reserved addresses are never requested. Model-specific registers that return a
valid Modbus exception are isolated so available measurements still publish.

## Default readings and enabling more

A meter added on the **Inputs & outputs** page gets a point and a channel for all 131 values, but
only these 11 readings are enabled:

| Reading                        | Measurement ID                           | Address            |
| ------------------------------ | ---------------------------------------- | ------------------ |
| Voltage L1, L2, L3             | `voltage-l1`, `voltage-l2`, `voltage-l3` | `0x5002`–`0x5007`  |
| Frequency                      | `frequency`                              | `0x5008`           |
| Current (total) and L1, L2, L3 | `current`, `current-l1`–`current-l3`     | `0x500a`–`0x5011`  |
| Active power (total)           | `active-power`                           | `0x5012`           |
| Imported and exported energy   | `import-energy`, `export-energy`         | `0x600c`, `0x6018` |

The other 120 channels are stored with `enabled: false`. The controller does not poll, publish or
command a disabled channel, and it does not count it against the limit of 256 enabled channels. A
disabled channel keeps its ID, name and calibration, so enabling it later does not change flows that
reference other channels. The recommended set lives in the plugin
(`WAGO_879_3020_DEFAULT_ENABLED` in `modbus/wago-879-3020.ts`), not in the profile, so the built-in
profile version and custom copies of it are unchanged.

To choose readings, open the meter's settings (gear icon on its card). Each register has a switch,
grouped by section. **Enable section** and **Disable section** switch a whole section;
**Recommended readings only** restores the 11 readings above. A meter on a custom copy of the map has
**Disable all unused readings** instead: it disables every reading that no guard, feedback or flow
uses. A reading that a guard or feedback uses cannot be switched off; the drawer names the output that
uses it, and the section and bulk actions skip it. The drawer shows how many channels the whole
controller would have enabled, for example "21 of 256 channels enabled on this controller". Save, then
apply. A card shows **Disabled** for a reading whose channel is disabled and **Not configured** for a
register that has no channel.

Rules:

- Existing configurations are not changed automatically. A meter that was published with all 131
  readings enabled stays that way until you press **Recommended readings only** (or switch
  readings) and apply.
- Saving an existing meter again adds its missing registers. With a runtime that advertises
  `channel-enabled-v1` they are added as disabled channels. With an older runtime only the missing
  recommended readings are added, and they are enabled; for a meter that has only the original five
  channels that is the six other recommended readings, and the other 120 registers get no channel at
  all.
- Only Modbus measurement channels without an action can be disabled. A guard or feedback cannot use
  a disabled channel.
- Disabling a channel that flows read is listed as a flow impact before you apply: those flows see the
  reading as unavailable.
- Disabled channels need a CC100 runtime that advertises `channel-enabled-v1`. With an older runtime
  the server refuses to publish a configuration that disables channels, a new meter gets only the 11
  recommended channels (no disabled ones), and the switches are locked with a note to update the
  CC100 runtime. A device that would exceed 256 channels on such a runtime cannot be saved; update the
  runtime, or remove registers or devices. Until the controller status has loaded, the page does not
  know which runtime is installed: it shows that it is checking and does not offer **Add Modbus
  device**.
- Downgrading is not supported while channels are disabled. A server or runtime version without
  `enabled` support rejects a stored configuration that contains `enabled: false` ("persisted
  configuration is invalid"). Before downgrading, publish a revision with every channel enabled, for
  example by rolling back to a revision from before readings were disabled. This procedure has not
  been tested on hardware.

## Bus time for ten meters

The figures below are **calculated** from the Modbus RTU frame sizes. They are not measured on
hardware: the meter's response turnaround is not specified in the manual and has not been measured,
and neither the RS-485 unit load of ten meters on one CC100 segment nor the CC100's supported baud
range has been verified.

Assumptions: 9600 baud with the factory 8E1 framing (11 bits per byte, about 1.15 ms per byte), a
3.5-character silent interval (about 4 ms) before every frame, FC03 requests of 8 bytes and responses
of 5 bytes plus 2 bytes per register. As the runtime does today, only adjacent enabled registers are
combined into one request (up to 120 registers); a disabled register between two enabled ones splits
the request.

| Per meter               | Requests | Registers | Bytes on the wire | Wire time incl. silent intervals |
| ----------------------- | -------- | --------- | ----------------- | -------------------------------- |
| 11 recommended readings | 3        | 22        | 83                | about 0.12 s                     |
| All 131 readings        | 7        | 240       | 571               | about 0.71 s                     |

Each request also waits for the meter to answer. With an assumed turnaround of 25 ms per request, one
meter takes about 0.2 s with the recommended readings and about 0.9 s with the full map. Ten meters on
one bus therefore need about 2 s of wire and turnaround time per poll round with the recommended
readings and about 9 s with every reading enabled.

These figures cover only wire time and the assumed turnaround. The largest cost is not in them and has
not been measured: the runtime starts a Python process and opens the serial port for every RTU request
(`cc100-runtime/src/modbus/transport/serial.ts`). With the recommended readings that is 3 process starts
per meter, so 30 per poll round for ten meters. On the CC100 this may make a round longer than the
default 5 s poll interval even with the recommended readings; if readings arrive late or rounds overlap,
raise the poll interval. The full-map row is a best case: when a combined request returns a Modbus
exception, the runtime reads that block again one register at a time
(`cc100-runtime/src/modbus/routing/adapter.ts`), which adds a request, and a process start, per
register. Enable only the readings you use before enabling the full map on many meters. The enabled-channel limit (256, onboard I/O channels included) allows ten meters with up to 25
readings each when no onboard I/O is configured.

Register addresses are zero-based hexadecimal wire addresses. Electrical and
energy quantities use IEEE 754 float32 ABCD byte order. kW, kvar, kVA, kWh and
kvarh are converted to W, var, VA, Wh and varh respectively. Frequency, ratios,
metadata and S0 settings carry their own units; codes have readable labels or hex
formatting. Total/net energy and resettable day counters use live readings so a
legitimate decrease or reset is preserved rather than treated as a counter fault.
Dedicated import/export and quadrant counters remain cumulative.

The runtime reads adjacent fields together, up to 120 registers per request,
without crossing undocumented gaps. Each block receives its actual acquisition
timestamp; no previous sweep is republished as a new sample. A protocol exception
may fall back to individual reads; ambiguous RTU timeouts and CRC failures do not.

The pulse-width row in A3.2 lists two words, overlapping the pulse-type register
at `0x4022`. The profile uses the single word at `0x4021` specified by the FC06
setting in A3.3, keeping pulse type separate. Timer values use packed decimal (BCD) digits,
consistent with A3.3: `0x0030` is 30 ms and `0x0025` is 25 seconds.
BCD decoding precedes scaling and integer milli-unit publication.

This profile expects the meter's standard float data format (`0x4026 = 1`).
It has no write actions and does not change the meter's configuration or counters.
Engineering values are explicitly rounded to three decimal places before the
strict integer milli-unit MQTT encoding. This removes float32 representation
noise (for example, `232.07000732421875 V` becomes `232070 mV`), while custom profiles that omit `decimalPlaces` keep exact values.
Rounding is a transport resolution, not a claim about the meter's accuracy.

An ambiguous RTU timeout or CRC failure quarantines the bus. Failed reads
recover through a validated read probe after a quiet period; corrected serial
framing, unit and register settings are used by the probe. Failed writes never
self-recover. Faulted or old samples are not presented as current readings.

## Development-device evidence

On 2026-09-26, the connected meter (then misidentified as 879-3000) responded at address 1 / 9600 / 8N1. FC03
reads confirmed meter code `0x1112` (4PS / 879-3020), baud setting `6`, parity setting `2`, and
standard data format `1`. Repeated reads through the production Node/Python
transport returned approximately 232-233 V on L1 and zero current, power, and
energy under the connected no-load conditions. This verifies communication and
decoding on that setup; loaded power/energy accuracy and other assemblies remain
separate hardware acceptance work.

The serial-enabled release was then installed through guided commissioning, and
all five named channels were published as configuration revision 1. After fixing
float32 precision handling, the final build delivered all five measurements through
MQTT and the web diagnostics screen. A three-minute observation verified fresh
source timestamps, advancing sequences for every channel, no measurement faults,
and an online controller throughout. Voltage varied approximately 232-235 V;
current, power, and both energy counters remained zero in the no-load setup.

On 2026-10-03, the meter's communication menu confirmed address 1, 9600 baud,
and no parity. Configuration revision 14 uses those actual settings (8N1), a
2000 ms response timeout, and the built-in `wago-879-3020` profile. The temporary
custom profile used during the runtime upgrade was removed; the existing I/O and
measurement channel identities were preserved.

After the managed runtime update, changing parity from even to none recovered
the quarantined bus without restarting the CC100 runtime. All five measurement
timestamps and sequences advanced, with no read faults and an online controller.
The web interface showed approximately 237 V, 0 A, 0 W, 697 Wh imported energy,
and 0 Wh exported energy. The diagnostics backend now clears a measurement read
fault only after a newer successful acquisition, so old timeout flags no longer
hide recovered readings.

The expanded map was applied as revision 15 on the same development controller.
All 131 documented values returned current samples with no read faults, and every
channel's source timestamp and sequence advanced across repeated observations.
L1/L2/L3 reported approximately 235–237 V, frequency 50 Hz, phase currents and
power zero, and imported active energy 697 Wh. Meter code was `0x1112`, address
1, baud code 6, parity code 2, and standard float data-format code 1. The existing
onboard I/O and original five measurement identities were preserved.

The timer register returned `0x0030`, matching the manual's 30 ms example.
The profile explicitly decodes packed decimal timer digits before scaling;
plain binary interpretation would incorrectly show 48 ms. This verifies the
register representation, not the electrical timing of the physical S0 output.
