# Attractap NFC emulator

Dedicated ESP-IDF firmware for an ESP32-S3 Supermini and a PN532 in ISO/IEC
14443-4 target mode. It presents host-configured NTAG424 DNA, MIFARE DESFire
EV2, and MIFARE DESFire EV3 profiles to an Attractap reader. It is controlled
entirely over USB serial; there is no Wi-Fi or network interface. This
application does not share configuration, partitions, PSRAM, display, OTA, or
runtime code with the production reader firmware.

## Hardware and wiring

Put the PN532 board in I2C mode before applying power. The common red Elechouse
V3 board uses switch positions `1=ON, 2=OFF`; verify the table printed on other
boards.

| ESP32-S3 Supermini | PN532     | Purpose                         |
| ------------------ | --------- | ------------------------------- |
| `3V3`              | `VCC`     | 3.3 V power                     |
| `GND`              | `GND`     | Common ground                   |
| `GPIO8`            | `SDA`     | I2C data                        |
| `GPIO9`            | `SCL`     | I2C clock                       |
| `GPIO7`            | `RSTPD_N` | Deterministic target-mode reset |

The firmware uses PN532 I2C address `0x24` (the unshifted 7-bit address), 100
kHz, and the ESP32-S3 internal pull-ups. Add external 4.7 kohm pull-ups to 3.3 V
if the module does not include them. IRQ is not required. `RSTPD_N` is required
so a pending target command can be canceled synchronously on `remove` without
waiting for a reader. GPIO7/8/9 match the tested Supermini layout but are not
standardized across all boards; change the arguments to `Pn532Target::begin`
for a different pinout. Do not connect GPIO7 to a module pin labeled `RSTO`;
that is an output, not the PN532 power-down/reset input.

## UID limitation

PN532 target mode fixes the first byte of the synthetic four-byte UID to
`0x08`. Profiles therefore accept only `08xxxxxx` UIDs. The remaining three
bytes are configurable. It is not possible to reproduce a physical card's
arbitrary UID with this hardware. HIL setup must seed the backend card record
with the profile UID (or `08ffffff` for the `unknown-uid` scenario).

## Build and operate

ESP-IDF 6.0.2 is the reference toolchain. Source its `export.sh`, then run from
the workspace root:

```sh
pnpm nx test attractap-nfc-emulator
pnpm nx build attractap-nfc-emulator
pnpm nx flash attractap-nfc-emulator -- --port /dev/cu.usbmodemXXXX
pnpm nx monitor attractap-nfc-emulator -- --port /dev/cu.usbmodemXXXX
```

`test` needs only a C++17 compiler. `scripts/test-host.sh` can also be invoked
directly. `build`, `flash`, and `monitor` fail with a clear message when
`idf.py` is not in `PATH`.

## Serial control

The emulator has no network interface. It is configured and controlled
entirely over the Supermini's USB-C port (USB Serial/JTAG), the same port used
for flashing and logs. No provisioning is needed: flash it, plug it in, and send
commands.

Each request is one line: a command name, optionally followed by one JSON
object with its arguments.

```text
profiles.select {"id":"supervisor"}
```

Each request produces exactly one reply line. Requests are handled one at a
time, in order. Reply lines start with `@nfc ` so they can be told apart from
ESP-IDF log output on the same port:

```text
@nfc {"ok":true,"result":{"state":"armed"}}
@nfc {"ok":false,"error":"profile_presented","message":"remove the current profile before selecting another"}
```

After boot the firmware prints `@nfc {"event":"ready","protocol":1}`. Event
lines have an `event` field instead of `ok`. Lines are limited to 8192 bytes,
and both `\n` and `\r\n` endings work.

`scripts/nfcemu.py` sends one command and prints the result. It needs pyserial,
which the ESP-IDF Python environment already has. It opens the port without
toggling DTR/RTS, so it does not reset the board.

```sh
alias nfcemu="python apps/attractap/nfc-emulator/scripts/nfcemu.py --port /dev/cu.usbmodemXXXX"
nfcemu profiles.create '{"id":"supervisor","type":"desfire-ev3","uid":"08010203"}'
nfcemu profiles.select '{"id":"supervisor"}'
nfcemu present
nfcemu trace.get
nfcemu remove
nfcemu reset
```

You can also type commands directly into `pnpm nx monitor attractap-nfc-emulator`.

## Commands

Mutating commands reply only after the requested control state is visible.
`present` replies `{"state":"armed"}` after the PN532 acknowledges
`TgInitAsTarget`; it does not report RF activation before a reader is present.
`status` exposes `presentRequested`, `targetArmed`, and `rfActive`.

| Command                            | Arguments   | Purpose                                         |
| ---------------------------------- | ----------- | ----------------------------------------------- |
| `help`                             |             | List commands                                   |
| `health`                           |             | Liveness                                        |
| `status`                           |             | Presentation and complete active card/key state |
| `profiles.list`                    |             | Enumerate persisted profiles                    |
| `profiles.create`                  | profile     | Create a profile and its factory snapshot       |
| `profiles.get`                     | `{"id"}`    | Read a persisted profile                        |
| `profiles.update`                  | profile     | Replace a persisted profile                     |
| `profiles.delete`                  | `{"id"}`    | Delete a persisted profile                      |
| `profiles.select`                  | `{"id"}`    | Select the active profile                       |
| `scenario`                         | `{"name"}`  | Select a named scenario                         |
| `fault.set`, `fault.clear`         | fault       | Configure or clear one fault                    |
| `overrides.set`, `overrides.clear` | `{"rules"}` | Replace or clear raw APDU rules                 |
| `removal.set`                      | removal     | Configure removal timing/command/count          |
| `present`, `remove`                |             | Enter or leave PN532 target mode                |
| `reset`                            |             | Restore and persist the active factory snapshot |
| `trace.get`, `trace.clear`         |             | Read or clear the bounded 128-exchange trace    |

Errors carry a stable `error` code, for example `invalid_json`,
`invalid_profile`, `not_found`, `profile_exists`, `profile_presented`,
`no_profile`, `persist_failed`, `pn532_not_ready`, or `unknown_command`.
Creating an existing profile returns `profile_exists`. Replacing or deleting a
missing profile returns `not_found`. Storage failures return `persist_failed`
and leave runtime state unchanged. You must `remove` an active profile before
selecting another profile, replacing or deleting it, or resetting it. Card-side
mutations are staged, persisted, and only then committed to runtime state. A
persistence failure produces no NFC success response and resets the secure
session.

### Profile schema

`profiles.create` and `profiles.update` accept:

```json
{
  "id": "card-a",
  "type": "ntag424",
  "uid": "08aabbcc",
  "active": true,
  "attraccessApp": true,
  "ndef": "0000",
  "keys": [
    { "number": 0, "version": 0, "value": "00000000000000000000000000000000" },
    { "number": 1, "version": 1, "value": "00112233445566778899aabbccddeeff" }
  ]
}
```

`id` is 1 to 31 alphanumeric, `_`, or `-` characters. `type` is `ntag424`,
`desfire-ev2`, or `desfire-ev3`. Omitted key slots are zero AES keys with
version zero. NDEF data is hexadecimal and limited to 1024 bytes. The complete
initial mutable state becomes the immutable factory snapshot. `profiles.update`
deliberately creates a new snapshot; card-side enrollment and reset mutations update only
the mutable state. `reset` copies the snapshot back atomically.

DESFire factory profiles normally omit `attraccessApp` (false). Attractap's
enrollment path selects PICC `000000`, creates `ACCE55` using key settings
`0F/86`, and then discovers key versions 1 through 5. NTAG424 profiles have the
NDEF application available by default.

### Scenarios, faults, and overrides

Named scenarios are `valid`, `unknown-uid`, `inactive`, `wrong-key`,
`authentication-failure`, `timeout`, `malformed-response`, and
`removal-timing`. `unknown-uid` presents `08ffffff`. `inactive` preserves a
normal NFC exchange because inactivity is backend card metadata; seed the
corresponding backend record as inactive. `wrong-key` and
`authentication-failure` reject `AuthenticateEV2First`.

Fault example (the next two `GetVersion` commands time out):

```json
{ "instruction": 96, "outcome": "timeout", "delayMs": 0, "count": 2 }
```

Raw override example:

```json
{
  "rules": [
    {
      "command": "9060000000",
      "mask": "ffffffffff",
      "outcome": "response",
      "response": "deadbeef91af",
      "count": 1
    }
  ]
}
```

An override outcome may be `response`, `timeout`, or `removed`; `response` is
the default. Omit `count` for an unlimited rule. Removal accepts any combination of
`afterMs`, `afterExchanges`, and `afterInstruction`. Elapsed-time removal is
evaluated while armed and RF-active; command/count removal is evaluated after
every override, fault, scenario, engine, or default result. The counter and
latched removal state reset for every presentation and behavior configuration.

Behavior order is fixed and host-tested:

1. Matching raw APDU override
2. Matching fault control
3. Card protocol engine
4. Unsupported-command default status

## Protocol coverage

The card-side engine implements reader-compatible ISO-wrapped native commands:

- Three-frame `GetVersion` identification for NTAG424, DESFire EV2, and EV3
- ISO NDEF application selection with distinct capability-container (`E103`)
  and NDEF data (`E104`) file behavior, binary read, and NDEF-only update
- DESFire PICC and little-endian Attraccess AID `55 CE AC` selection
- Attraccess application creation and six AES key slots/version discovery
- `AuthenticateEV2First` with card challenge validation, TI creation, and
  NXP SV1/SV2 AES-CMAC session derivation
- Inverse EV2 command MAC verification, command decryption, response MAC, and
  command-counter handling used by the current reader
- Secure `ChangeKey`, XOR key recovery, JAMCRC verification, key versions, and
  persistence of enrollment/reset state across presentations and reboot

The transport intentionally uses PN532 normal frames only. Commands and raw
override responses are capped at 250 bytes; short-APDU `Le=0` means up to 256
bytes but reads are further capped to the 248-byte response payload that fits a
normal frame. Extended PN532 frames are not implemented.

Trace entries contain timestamp, duration, command APDU, response APDU,
outcome, and behavior source.

## Hardware assumptions and HIL scope

Host tests validate the state machine, model validation, precedence,
persistence corruption handling, NIST AES-CBC, RFC 4493 AES-CMAC, JAMCRC,
GetVersion, DESFire application operations, and EV2First challenge/response.
They cannot validate PN532 RF timing, antenna tuning, a module's physical mode
switch, Supermini pin labeling, or interoperability differences between PN532
firmware revisions. Those remain hardware-only checks.

Before relying on this in CI, run HIL cases against the actual target reader
for authentication with factory/enrolled keys, supervision with two sequential
profiles, enrollment, key reset, all fault outcomes, explicit removal, and
timed removal. PN532 target mode itself, not the APDU engine, is the remaining
hardware compatibility boundary.
