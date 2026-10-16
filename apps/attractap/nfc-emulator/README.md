# Attractap NFC emulator

Dedicated ESP-IDF firmware for an ESP32-S3 Supermini and a PN532 in ISO/IEC
14443-4 target mode. It presents host-configured NTAG424 DNA, MIFARE DESFire
EV2, and MIFARE DESFire EV3 profiles to an Attractap reader. This application
does not share configuration, partitions, PSRAM, display, OTA, or runtime code
with the production reader firmware.

## Hardware and wiring

Put the PN532 board in I2C mode before applying power. The common red Elechouse
V3 board uses switch positions `1=ON, 2=OFF`; verify the table printed on other
boards.

| ESP32-S3 Supermini | PN532 | Purpose |
| --- | --- | --- |
| `3V3` | `VCC` | 3.3 V power |
| `GND` | `GND` | Common ground |
| `GPIO8` | `SDA` | I2C data |
| `GPIO9` | `SCL` | I2C clock |
| `GPIO7` | `RSTPD_N` | Deterministic target-mode reset |

The firmware uses PN532 I2C address `0x24` (the unshifted 7-bit address), 100
kHz, and the ESP32-S3 internal pull-ups. Add external 4.7 kohm pull-ups to 3.3 V
if the module does not include them. IRQ is not required. `RSTPD_N` is required
so a pending target command can be canceled synchronously on `/remove` without
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

## Provisioning

Provisioning persists the station SSID, password, and bearer token as one
versioned, checksummed NVS blob. A failed write cannot leave mixed credentials.
The token must be 16 to 128 characters. Tokens are never included in HTTP
responses, logs, NFC exchange traces, or card profile blobs.

### USB serial

Open the USB Serial/JTAG console at 115200 baud and send one line. `|` is the
field separator and therefore cannot occur in these values.

```text
PROVISION Lab WiFi|secret password|replace-with-a-random-32-byte-token
```

The device prints `OK provisioned; restarting` and restarts. This path is
intended for CI and bench setup.

### Setup access point

An unprovisioned device creates the open temporary network
`Attractap-NFC-XXXX`. Connect to it and provision through `192.168.4.1`:

```sh
curl -X POST http://192.168.4.1/provision \
  -H 'content-type: application/json' \
  -d '{"ssid":"Lab WiFi","password":"secret password","token":"replace-with-a-random-32-byte-token"}'
```

After restart the device joins the station network, reconnects after a dropped
connection, and advertises `_http._tcp` as
`attractap-nfc-emulator.local`. Provisioning is unauthenticated only before a
token exists. HTTP reprovisioning then requires that token; use serial if the
token is lost. The setup AP shuts down after ten minutes; restart the device to
open another setup window.

The ESP32 has no display or preinstalled per-device secret, so the setup AP
cannot provide meaningful proof of physical possession without making
standalone setup impossible. It is intentionally limited to the initial
ten-minute, physically local setup window. Both setup and control APIs use
plain HTTP, not HTTPS: provisioning and HIL control must run on an isolated
bench network or trusted test VLAN. Do not expose the AP or station service to
an untrusted network; bearer tokens and Wi-Fi credentials are otherwise
observable to an on-path attacker. USB serial provisioning is preferred in CI.

## API

Send `Authorization: Bearer TOKEN` on every endpoint except initial
`/provision`. JSON mutations return after the requested control state is
visible. `/present` returns `{"state":"armed"}` after PN532 acknowledges
`TgInitAsTarget`; it does not falsely report RF activation before a reader is
present. `/status` exposes `presentRequested`, `targetArmed`, and `rfActive`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Authenticated liveness |
| `GET` | `/status`, `/state` | Presentation and complete active card/key state |
| `POST` | `/profiles` | Create a profile and its factory snapshot |
| `GET` | `/profiles` | Enumerate persisted profiles |
| `GET`, `PUT`, `DELETE` | `/profiles/{id}` | Read, replace, or delete a persisted profile |
| `POST` | `/profiles/select` | Select `{ "id": "card-a" }` |
| `POST` | `/scenario` | Select `{ "name": "valid" }` |
| `POST`, `DELETE` | `/fault` | Configure or clear one fault |
| `POST`, `DELETE` | `/overrides` | Replace or clear raw APDU rules |
| `POST` | `/removal` | Configure removal timing/command/count |
| `POST` | `/present`, `/remove` | Enter or leave PN532 target mode |
| `POST` | `/reset` | Restore and persist the active factory snapshot |
| `GET`, `DELETE` | `/trace` | Read or clear the bounded 128-exchange trace |

Creating an existing profile returns `409`; replacing or deleting a missing
profile returns `404`; storage failures return `500` and leave runtime state
unchanged. Active profiles must be removed before selection, replacement,
deletion, or factory reset. Card-side mutations are staged, persisted, and only
then committed to runtime state; persistence failure produces no NFC success
response and resets the secure session.

Example lifecycle:

```sh
BASE=http://attractap-nfc-emulator.local
AUTH="Authorization: Bearer $NFC_EMULATOR_TOKEN"

curl -X POST "$BASE/profiles" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"id":"supervisor","type":"desfire-ev3","uid":"08010203"}'
curl -X POST "$BASE/profiles/select" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"id":"supervisor"}'
curl -X POST "$BASE/present" -H "$AUTH"
curl "$BASE/trace" -H "$AUTH"
curl -X POST "$BASE/remove" -H "$AUTH"
curl -X POST "$BASE/reset" -H "$AUTH"
```

### Profile schema

Profile creation/replacement accepts:

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
initial mutable state becomes the immutable factory snapshot. `PUT` deliberately
creates a new snapshot; card-side enrollment and reset mutations update only
the mutable state. `/reset` copies the snapshot back atomically.

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
outcome, and behavior source. Wi-Fi credentials and bearer tokens cannot enter
the trace.

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
