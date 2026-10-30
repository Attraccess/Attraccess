# Attractap Firmware

Firmware for the Attractap NFC readers (ESP32-S3), built on **ESP-IDF v6.0.2** (`idf.py` + CMake — no Arduino, no PlatformIO).

## Variants

One firmware per hardware flavor, defined by a file in `variants/`:

| Variant                    | Board                          | Hardware                                                                    |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `attractap-touch`          | ESP32-S3 DevKitC (V3 hardware) | ST7701 480x480 RGB panel, GT911 touch, TCA9554 IO expander, PN532 NFC, WiFi |
| `attractap-touch-v2`       | ESP32-S3 DevKitC (V4 hardware) | as above, 16-bit PCA9555-compatible expander @0x24, PN532 @0x64             |
| `attractap-lite-ethernet`  | Adafruit Qualia S3             | headless, WS2812 24-LED ring, W5500 ethernet                                |
| `attractap-touch-demo`     | V3 display hardware            | Offline demo API and demo settings                                          |
| `attractap-touch-v2-demo`  | V4 display hardware            | Offline demo API, demo settings and power button                            |

Offline demos preserve an already set device clock, including dates before 2025.
An unset clock is at zero or still counting uptime from the Unix epoch. On a cold
boot with unset time, demos start at 1 January 2026, 12:00 UTC, so the clock and session
timestamps share a plausible timeline. This is a demonstration date, not the
actual current time; demo firmware does not start SNTP.
Demo presets are trusted local time and may display without a server sample.

Network clock samples support UTC dates from 1 January 2025 (inclusive) to
1 January 2100 (exclusive), with timezone offsets from -840 to +840 minutes.
This range covers the reader's intended operating lifetime while rejecting
corrupted future timestamps that still fit a signed 64-bit integer. A rejected
sample leaves both UTC and the timezone offset unchanged, before and after
SNTP synchronization. Trusted offline demo presets use their separate path.

Each variant file sets the compile definitions (pins, feature flags, firmware
name) and the source subtrees excluded for that hardware.

The `*-park` variants (`attractap-touch-park`, `attractap-touch-v2-park`,
`attractap-lite-ethernet-park`) build `park/` instead of the reader app: the
[hardware lab](../../attractap-lab/README.md) janitor flashes them between lab sessions to
turn off the screen, LEDs, beeper and NFC while keeping USB-Serial-JTAG
available. They set `set(ATTRACTAP_RELEASE OFF)`, so release builds skip
them even if listed; any variant can use that tag to stay out of releases. The firmware version
lives in `version.txt` — bump it whenever firmware source changes (CI enforces
this).

## Language protocol compatibility and rollback

Firmware 1.6.5 adds English/German display localization. The server sends a
default language in `READER_AUTHENTICATED`, a cardholder language in
`CARD_AUTHENTICATION_DATA`, and default changes through `READER_LANGUAGE`.
`CARD_AUTHENTICATION_DATA.languageFallback` marks a missing or unsupported
cardholder preference. The canonical `language` still supplies the current fallback
to older readers; current firmware follows live default changes during that session.
Form validation replies retain `message` and add a stable `code` for translation.
Existing event names, credentials and field values keep their meaning.

A reader without a cached API default starts in English, including offline setup
and connection screens. Valid `en`/`de` defaults received from the API are saved
in the existing settings store and restored on reboot. Disconnects clear the
personal language while retaining this system default. Cardholder languages are
never saved as the device default. Repeated unchanged defaults do not rewrite
flash; missing or malformed fields do not overwrite the persisted choice.
Locale variants are normalized by the server; firmware accepts canonical
`en`/`de` wire values and uses English for a noncanonical default.

| Server | Reader firmware | Behavior |
| --- | --- | --- |
| With language support | 1.6.5 | The system default applies outside a cardholder session; a supported user's language applies during the session, with the system default as fallback for missing or unsupported user languages. Form error identifiers translate in both languages. |
| Without language support | 1.6.5 | Missing authentication language fields select English. Form errors without a code show the English invalid-input fallback. Resource and card operations retain their existing protocol. |
| With language support | Pre-localization implementation on main | Additional payload fields are ignored. `READER_LANGUAGE` is acknowledged, then logged as an unknown event; it does not change authentication or resource state. Existing German screens remain unchanged. Form errors still use the retained `message`. |

The predecessor behavior was inspected at main commit
`721ba7a6891042bf65d356f4dcf276d893ecaa0a`: `src/api/api.cpp` acknowledges events
before dispatching them and only logs unknown types. `api/handlers/auth.cpp` reads the
device name without consuming additional fields; `api_cards.cpp` likewise
ignores the added language field. This is source evidence for that predecessor,
not verification of every deployed firmware build.

For rollback, restore the previous server release first, then reconnect readers
so they receive its authentication response. Readers still running 1.6.5 use
English until their firmware is restored. Restore each reader's previous
variant-specific firmware image next; the predecessor uses its existing German
interface. Retained server language settings need no deletion. Confirm reader
authentication, a card login, a resource action and logout after rollback.

Desktop tests exercise missing reader/card language fields, legacy form errors,
default changes during sessions, restoring the latest default at logout, and
loading the cached default after an offline reboot.
These checks use the production parser with a simulated server. Deployed-reader
rollback, physical NFC and live networking remain unverified.

## Mass introduction protocol (1.7.0)

Firmware 1.7.0 adds the mass-introduction scan screen (ATT-1151). The server
arms any reader that reports `capabilities.cardEnrollment`. Firmware older than
1.7.0 acknowledges and ignores these events, so readers must be updated before
they can take part in mass introductions.

| Direction | Event | Payload |
| --- | --- | --- |
| Server → reader | `MASS_INTRODUCTION_START` | `sessionId`, `targetName`, `introducerUsername`, `remainingMs` |
| Reader → server | `REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA` | `sessionId`, `uid` (lowercase hex) |
| Server → reader | `MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA` | `sessionId` plus `keyNo`, `key`, `username`, or `error` |
| Reader → server | `MASS_INTRODUCTION_CARD_AUTH_CONFIRMED` | `sessionId`, `uid` |
| Server → reader | `MASS_INTRODUCTION_RESULT` | `sessionId`, `success` plus `username`, `alreadyIntroduced`, `participantCount`, or `error` |
| Reader → server | `MASS_INTRODUCTION_CANCEL` | `sessionId` |
| Server → reader | `MASS_INTRODUCTION_END` | `sessionId`, `reason` (`expired`, `cancelled`, `revoked`) |

Each tapped card is authenticated with its key like a supervisor card before it
is confirmed. Errors stay on the scan screen instead of opening the generic error
popup. After each result the screen waits for the next card. A card left on the
reader is not read again. A reader that is busy (someone signed in, another flow
active, a firmware update) replies to `START` with `MASS_INTRODUCTION_CANCEL`.
The cancel button, the local countdown and an `END` for the shown session return
the reader to its normal screens. A disconnect does too. Messages for any other
`sessionId` are ignored. Serial logs mark the transitions:
`MassIntroduction: started session=…`, `MassIntroduction: card uid=…`,
`MassIntroduction: introduced user=… already=… count=…`,
`MassIntroduction: refused session=… reason=…` and
`MassIntroduction: ended reason=… session=…`.

## Enrollment protocol (1.8.0)

Firmware 1.8.0 no longer registers itself. A reader without credentials sends
`READER_REGISTER` with `enrollment: {protocol: 1}`. The server answers with a
rotating code and creates the reader record only after an administrator with
`resources.update` approved that code (ATT-1168). All times are relative: an
unregistered reader has no synced clock.

| Direction | Event | Payload |
| --- | --- | --- |
| Reader → server | `READER_REGISTER` | `enrollment: {protocol: 1}` |
| Server → reader | `READER_ENROLLMENT_CODE` | `code` (`K7P-3XQ`), `rotatesInMs`, `expiresInMs`; sent again on every rotation (30 s) |
| Server → reader | `READER_ENROLLMENT_REJECTED` | `reason` (`RATE_LIMITED`, `BUSY`), `retryAfterMs`; the reader asks again after that time (5 s to 10 min) |
| Server → reader | `READER_REGISTER` | `id`, `token`, sent once after approval; the reader stores them and authenticates |

Touch variants show the code on the pending-approval screen with a countdown.
Every variant, including Lite, reports it on the serial console:
`api.status.get` returns `status: "pending_approval"` plus `enrollmentCode` and
`enrollmentRotatesInMs`, which the web flasher uses for its **Approve** button.
A pending request ends when the connection closes or after 10 minutes, when the
server closes the socket. A rejection (`READER_UNAUTHORIZED`) still clears the
stored credentials, so a reader that connects to the wrong server waits for
approval there instead of creating a record.

### Readers without a screen (1.8.1)

Firmware without a display (Attractap Lite) adds `hasScreen: false` to `enrollment` and
its `firmware` (`name`, `variant`, `version`) to `READER_REGISTER`. If `hasScreen` is
missing or `true` the server treats the reader as a screen reader. For readers without a
screen `READER_ENROLLMENT_CODE` also carries `pattern`: four colour names out of `red`,
`green`, `blue`, `yellow`, `magenta`, `white` (no two neighbours equal, segment 4 counts as
neighbour of segment 1), or `null` when all 120 patterns are in use. The pattern changes with
the code, the previous one stays valid until the next rotation. The reader draws it with
`LedPattern` (`src/led/led_pattern.hpp`, host tests in `tests/led-pattern`) and breathes white
for `null`, after a rejection, or once the pattern is `LedPattern::STALE_GRACE_MS` (10 s) past its
rotation without a new one (e.g. a stalled connection). The server keeps the patterns of a reader
that left reserved for one rotation plus that grace and a 5 s margin (45 s,
`ENROLLMENT_PATTERN_COOLDOWN_MS`), so a stale ring never matches another reader's list entry. The
ring lights up green (`triggerSuccess()`) when the credentials arrive. An administrator approves it in the
**Waiting Lite readers** card (`GET /api/device-enrollment/lite-pending`,
`POST /api/device-enrollment/approve-lite`). The code keeps working for the web flasher.

### Compatibility

| Server | Reader firmware | Behavior |
| --- | --- | --- |
| With enrollment codes | 1.8.0 and newer | Shows a code, receives its credentials after approval. |
| With enrollment codes | Older than 1.8.0, not registered | Its `READER_REGISTER` has no `enrollment` field. The server creates nothing and sends no reply, so the reader waits quietly. Update it with the web flasher first. |
| With enrollment codes | Any version, already registered | Authenticates with its stored credentials exactly as before. |
| Without enrollment codes (older server) | 1.8.0 and newer | `READER_REGISTER` receives the old immediate `id`/`token` reply and works as before; `READER_ENROLLMENT_*` are never sent. |
| With enrollment codes, without LED patterns | Lite 1.8.1 and newer | No `pattern` arrives, the ring breathes white. Approve it with the code in the web flasher. |
| With LED patterns | Lite 1.8.0 | Sends no `hasScreen`, so it is treated as a screen reader and not listed. Approve it with the code in the web flasher. |

## Building

Prerequisites: [ESP-IDF v6.0.2](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/get-started/index.html) installed for the `esp32s3` target. Install the project-local toolchain at `.tools/esp-idf` with `pnpm nx run attractap-firmware:setup-toolchain`, or use `INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh --workspace-only` during bootstrap. Local setup and CI share `tools/setup-esp-idf.sh` and the pin in `esp-idf-version.txt`; setup repairs partial installs and verifies `idf.py` can run. No extra Python packages are needed — `esptool` is picked up from your `PATH` or from ESP-IDF's own Python environment, and `cmake`/`ninja` are installed into the IDF tool set automatically if your system lacks them.

NixOS note: Espressif's prebuilt binaries (xtensa toolchain, cmake, ninja) are dynamically linked against FHS paths, so they need `programs.nix-ld.enable = true;` (or an FHS environment like `steam-run`) to execute.

Build the four active variants: `attractap-touch`, `attractap-touch-v2`, `attractap-touch-demo` and `attractap-touch-v2-demo` (also what CI and `pnpm nx run attractap-firmware:build` run). Other variants remain available for manual builds; uncomment them in `build_firmwares.py` to ship them again:

```bash
python3 build_firmwares.py
```

This generates the CA-certificate headers (`src/certs/`), builds each variant
into `build/<variant>/`, and writes `firmware_output/` containing per variant:

- `<name>_<variant>.bin` — merged image for the web serial flasher (flash at offset `0x0`)
- `<name>_<variant>_ota.bin` — app-only image for OTA updates via the server
- `<name>_<variant>.elf` — unstripped ELF for server-side coredump symbolication
- `firmwares.json` — manifest consumed by the Attraccess API/frontend

Build the lab-only parking images (no manifest, not part of a release) into
`firmware_output_lab/<name>.bin`, one merged image per hardware family:

```bash
python3 build_firmwares.py --lab  # or: pnpm nx run attractap-firmware:build-lab
```

`--variant NAME` restricts either mode to the given variants.

Build a single variant during development:

```bash
idf.py -B build/attractap-touch -DATTRACTAP_VARIANT=attractap-touch build
idf.py -B build/attractap-touch flash monitor
```

Debug build (replaces the old `attractap-touch-debug` PlatformIO env):

```bash
idf.py -B build/dbg -DATTRACTAP_VARIANT=attractap-touch \
       -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.debug" build
```

Note: `tools/build_individual_ca_certs.py` needs network access on the first
run (it downloads Mozilla's CA bundle, cached for 7 days). Run it once before
`idf.py` when building without `build_firmwares.py`.

## Display Theme

All display variants use the web frontend's dark palette: deep blue-green
backgrounds (`#162124`), raised surfaces (`#1E2C2F`), water-blue accents
(`#82C4CE`), light text, small corners and restrained borders. Shared styles live
in `src/display/theme.hpp` and `theme.cpp`, including pressed, disabled, focused
and keyboard states. Green, amber and red retain their status/safety meanings.
This is the firmware's fixed dark theme; the web application's saved dark-mode
preference does not configure a reader. Lite's LED status colors are unchanged.

The logos preserve the approved full-color mascot, with light vector lettering
for dark backgrounds. From the repository root,
run `node scripts/generate-brand-assets.mjs` to regenerate the 133 x 40 and
400 x 120 `*.rgb565a8` assets alongside the web artwork, or add `--check` to
verify them without writing files. They contain a little-endian RGB565 color
plane followed by an A8 alpha plane. ESP-IDF embeds these binary assets only
for display variants; the small image-descriptor headers are handwritten.
The lockscreen, resource list and no-resources screens use a bottom-left square
crop of `apps/frontend/public/login-wallpaper-RAL5020.png`, preserving the raccoon
and the rings. The same brand generator produces a 480 x 480 PNG preview at
`apps/frontend/public/login-wallpaper-RAL5020-480.png` and the firmware asset.
`lockscreen.rgb565` is a 460,800-byte little-endian RGB565
asset shared by those screens, embedded once with four-byte alignment through
`logos.S.in`. No generated C++ pixel arrays are needed.

## Host Tests

From the repository root, run `pnpm nx run attractap-firmware:test`. It runs
SupervisionFlow logic tests and the [real LVGL host-rendering harness](tests/display-theme/README.md).
The latter checks theme states, both logo assets, selected production screens
and deterministic 480 x 480 rendering. The dedicated firmware CI runs both.

Host renders are not photographs or tests of a physical panel. Confirm actual
device colors, touch/keyboard interactions and heap headroom on the target
hardware before deployment.

## Flashing

- **Web flasher (initial install):** the Attraccess frontend flashes the merged
  `.bin` over Web Serial (Chrome/Edge). The device console runs on the ESP32-S3
  USB-Serial-JTAG port.
- **CLI:** `python -m esptool --chip esp32s3 write_flash 0x0 firmware_output/<name>_<variant>.bin`
- **OTA:** upload `firmware_output` via the Attraccess server; updates stream to
  the readers over the websocket.

## Latin-1 Font Smoke Test

CMake generates uncompressed Montserrat fonts in each build directory for sizes
10, 14, 16, 18, 20, 24, 26, 28, 32, and 36. The original configured sizes remain
unchanged. The wall clock adds digit-only fonts at 56 and 88 px. Firmware,
desktop, and host rendering tests share
`tools/latin1_fonts.cmake`. Builds require Node.js/npm (`npx`) and curl; the first
build downloads the pinned LVGL 9.3.0 font source (SHA-256 verified) and
`lv_font_conv@1.5.3`. Subsequent builds reuse their generated files. Do not commit
the generated C files. For standalone generation, run
`tools/generate_latin1_fonts.sh` (outputs to the ignored `.cache/latin1-fonts/`).

On a touch device, verify `ÄÖÜ äöü ß | München, Größe, für` in resource names and
descriptions, form labels/descriptions/placeholders, select options, text editors
and value previews, project names, popup messages, introducer lists, health
reasons, and flow-button labels. Also verify a signed-in username at 10px and an
enrollment, reset, or supervision username at 36px. Check card statuses at 32px,
supervision statuses and reset titles at 28px, empty-resource messages at 26px,
and the PIN title at 32px. Compare ASCII text, hierarchy, wrapping, and clipping
with the previous firmware. Confirm no missing-glyph boxes, preserved multiline
layout, and that selecting an option such as `Size™` still submits its original
value while displaying `SizeTM`. Host rendering checks do not replace this
on-device smoke test.

## Serial provisioning console

The firmware speaks a line protocol on the USB console (115200 8N1):
`CMND <topic> <json>` in, `RESP <topic> <json>` out — used by the frontend's
hardware setup flow. Log lines have the format `[Module] LEVEL: message`.

## Attractap Lite LED Animations

The Attractap Lite variant uses a WS2812 LED ring for status feedback. For a user-facing guide to LED states and triggers, see the [Attractap Lite LED Guide](../../../docs/en/attractap/led-guide.md) in the docs.

### LED States (for developers)

| State                         | Color        | Circular Animation                              | When used                   |
| ----------------------------- | ------------ | ----------------------------------------------- | --------------------------- |
| `LED_STATE_CONFIG_REQUIRED`   | Red / Orange | 3 dots alternating red ↔ orange every 12 phases | Device needs configuration  |
| `LED_STATE_INIT`              | Blue         | 8-LED fading tail moving around ring            | Booting / connecting        |
| `LED_STATE_WAIT_FOR_CARD`     | Green        | 6 segments breathing in/out of phase            | Ready for card tap          |
| `LED_STATE_AUTHENTICATE_CARD` | Cyan         | 6-LED fading tail at double speed               | Card being read             |
| `LED_STATE_NO_RESOURCES`      | Orange       | Full-ring on/off flash every 10 phases          | No resources assigned       |
| `LED_STATE_ENROLLMENT_PENDING`| Four colours | 4 steady segments (5 lit + 1 dark LED each on the 24 LED ring), white breathing when no pattern is free | Waiting for approval |
| `LED_STATE_FIRMWARE_UPDATE`   | Blue / White | Static alternating blue/white pixels            | Firmware update in progress |

### LED Triggers

| Trigger             | Color        | When used          |
| ------------------- | ------------ | ------------------ |
| `triggerSuccess()`  | Green        | Auth succeeded, enrollment approved |
| `triggerError()`    | Red flash    | Auth failed        |
| `triggerIndicate()` | Yellow flash | Card held too long |
