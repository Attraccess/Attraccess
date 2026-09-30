# WAGO 879-3000 over CC100 RS-485

The CC100 runtime supports read-only measurements from the WAGO 879-3000 over its
two-wire RS-485 interface. Select the **WAGO 879-3000 — Modbus RTU** device profile.

## Connection

The [WAGO energy-meter manual, V1.8](https://www.wago.com/us/d/5937710), appendix 3,
documents these factory settings:

| Setting | Value |
| --- | --- |
| Transport | Modbus RTU |
| CC100 serial path | `/dev/serial` |
| Slave/unit address | `1` |
| Baud rate | `9600` |
| Data bits | `8` |
| Parity | None |
| Stop bits | `1` |

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
3. Add the meter with unit address 1 and profile **WAGO 879-3000 — Modbus RTU**.
4. Add measurement channels bound to the signals you need.
5. Save, review, and publish. Wait for the revision to be applied, then inspect
   fresh measurements in **Diagnostics**.

The profile uses FC03 with zero-based hexadecimal wire addresses and IEEE 754
float32 ABCD byte order, as documented on manual pages 36-38:

| Signal | Address | Register units | Engineering units |
| --- | --- | --- | --- |
| L1 voltage | `0x5002` | V | V |
| L1 current | `0x500C` | A | A |
| Total active power | `0x5012` | kW | W |
| Imported active energy | `0x600C` | kWh | Wh |
| Exported active energy | `0x6018` | kWh | Wh |

This profile expects the meter's standard float data format (`0x4026 = 1`).
It has no write actions and does not change the meter's configuration or counters.
Engineering values are explicitly rounded to three decimal places before the
strict integer milli-unit MQTT encoding. This removes float32 representation
noise (for example, `232.07000732421875 V` becomes `232070 mV`), without changing
the exact semantics of legacy or custom profiles that omit `decimalPlaces`.
Rounding is a transport resolution, not a claim about the meter's accuracy.

The existing RTU transport quarantines a bus after an ambiguous timeout or CRC
failure; it does not retry transactions automatically. Resolve the physical or
configuration cause and establish a quiescent bus before restarting the runtime.
Faulted or old samples are not presented as current readings.

## Development-device evidence

On 2026-09-26, the connected 879-3000 responded at address 1 / 9600 / 8N1. FC03
reads confirmed meter code `0x1112`, baud setting `6`, parity setting `2`, and
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
