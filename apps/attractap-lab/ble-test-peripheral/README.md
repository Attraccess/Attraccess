# BLE test peripheral (lab only)

A generic GATT peripheral for the plugin BLE transport hardware tests: throughput, long sessions, notification
bursts and indications. It is not shipped and is not part of the reader firmware. It runs on an Attractap Touch (v1)
board (ESP32-S3, 16 MB flash) at a lab place such as `attractap-touch-1`. It does not use the display; it logs over
the USB-Serial-JTAG console. The janitor erases and parks the place when the session releases it.

## GATT table

NimBLE peripheral, one connection, no pairing or security, preferred ATT MTU 517. It advertises the service UUID
(complete 128-bit list) and the name `AttrBLE-Test-XXXX` (last two bytes of the BT MAC) in the scan response.
On boot it logs `ready address=AA:BB:CC:DD:EE:FF type=public name=...`.

All UUIDs share the pattern `a7c0b1e0-XXXX-4f6e-9b3a-5c1d2e3f4a50`.

| Key | UUID | Properties | Behaviour |
| --- | --- | --- | --- |
| service | `a7c0b1e0-0001-4f6e-9b3a-5c1d2e3f4a50` | primary | |
| `read` | `a7c0b1e0-0002-4f6e-9b3a-5c1d2e3f4a50` | read | Returns bytes `0, 1, 2, ...` (`i & 0xff`), 64 bytes by default, 1..512 via control `0x05`. |
| `write` | `a7c0b1e0-0003-4f6e-9b3a-5c1d2e3f4a50` | read, write | Stores the last value (up to 512 bytes, long writes included); reading returns it. Counts as a received chunk. |
| `wwr` | `a7c0b1e0-0004-4f6e-9b3a-5c1d2e3f4a50` | write without response | Counts as a received chunk. |
| `notify` | `a7c0b1e0-0005-4f6e-9b3a-5c1d2e3f4a50` | notify | Acks (echo mode) and bursts. |
| `indicate` | `a7c0b1e0-0006-4f6e-9b3a-5c1d2e3f4a50` | indicate | Indication series. |
| `control` | `a7c0b1e0-0007-4f6e-9b3a-5c1d2e3f4a50` | write | Commands below. |

## Control commands

Write one command to `control`. Integers are little-endian. A malformed command fails with ATT error `0x0d`
(invalid attribute value length); an unknown opcode with `0x06` (request not supported).

| Command | Bytes | Effect |
| --- | --- | --- |
| Echo/ack mode | `01 <on:u8>` | When on, every chunk received on `write` or `wwr` is acknowledged with a notification on `notify`: 8 bytes, `u32` running byte count of this connection + `u32` chunk sequence (1-based). Needs `notify` subscribed. Off after each connect. |
| Burst | `02 <count:u16> <size:u16>` | Sends `count` notifications of `size` bytes on `notify` as fast as possible (retrying while NimBLE is out of buffers). Each starts with `u32` sequence (1-based) + `u32` count; the rest is filler. `size` is clamped to 8..min(MTU − 3, 512). |
| Indicate | `03 <count:u16> <size:u16>` | Like burst on `indicate`; each indication waits for the confirmation (5 s). |
| Reset counters | `04` | Resets the byte and chunk counters and the duration clock. |
| Read length | `05 <len:u16>` | Sets the `read` length, 1..512. |
| Disconnect | `06` | The peripheral drops the connection (peripheral-loss test). |

Bursts and acks run on a worker task, never in the GATT callback. Up to 64 acks or series can be queued; an ack
that does not fit is counted as dropped and logged at disconnect.

Per connection it logs the MTU, and on disconnect the reason, duration, received bytes and chunks, receive
throughput in KiB/s, notifications sent and dropped acks:

```
ble-test: disconnected reason=0x213 mtu=517 duration=600512ms rx_bytes=262144 rx_chunks=514 rx=0.43KiB/s notifications=514 acks_dropped=0
```

It advertises again after every disconnect.

## Build and flash

With the project-local ESP-IDF (`INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh` installs it at
`.tools/esp-idf`):

```sh
. .tools/esp-idf/export.sh
cd apps/attractap-lab/ble-test-peripheral
idf.py set-target esp32s3   # once
idf.py build
```

The images land in `build/` (`bootloader/bootloader.bin` at 0x0, `partition_table/partition-table.bin` at 0x8000,
`ble-test-peripheral.bin` at 0x10000; `build/flash_args` lists them). Flash them through labgrid on a place your
session holds, as for any other image (see the labgrid section of `../README.md`). Do not flash a reader place that
other tests need; the janitor parks the place again on release.
