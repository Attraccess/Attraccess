# Attractap Firmware

Firmware for the Attractap NFC readers (ESP32-S3), built on **ESP-IDF v6.0.2** (`idf.py` + CMake — no Arduino, no PlatformIO).

## Variants

One firmware per hardware flavor, defined by a file in `variants/`:

| Variant                   | Board                          | Hardware                                                                    |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `attractap-touch`         | ESP32-S3 DevKitC (V3 hardware) | ST7701 480x480 RGB panel, GT911 touch, TCA9554 IO expander, PN532 NFC, WiFi |
| `attractap-touch-v2`      | ESP32-S3 DevKitC (V4 hardware) | as above, 16-bit PCA9555-compatible expander @0x24, PN532 @0x64             |
| `attractap-lite-ethernet` | Adafruit Qualia S3             | headless, WS2812 24-LED ring, W5500 ethernet                                |
| `attractap-touch-demo`    | V3 display hardware            | Offline demo API and demo settings                                          |
| `attractap-touch-v2-demo` | V4 display hardware            | Offline demo API, demo settings and power button                            |

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

| Server                   | Reader firmware                         | Behavior                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| With language support    | 1.6.5                                   | The system default applies outside a cardholder session; a supported user's language applies during the session, with the system default as fallback for missing or unsupported user languages. Form error identifiers translate in both languages.     |
| Without language support | 1.6.5                                   | Missing authentication language fields select English. Form errors without a code show the English invalid-input fallback. Resource and card operations retain their existing protocol.                                                                 |
| With language support    | Pre-localization implementation on main | Additional payload fields are ignored. `READER_LANGUAGE` is acknowledged, then logged as an unknown event; it does not change authentication or resource state. Existing German screens remain unchanged. Form errors still use the retained `message`. |

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

| Direction       | Event                                                | Payload                                                                                     |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Server → reader | `MASS_INTRODUCTION_START`                            | `sessionId`, `targetName`, `introducerUsername`, `remainingMs`                              |
| Reader → server | `REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA` | `sessionId`, `uid` (lowercase hex)                                                          |
| Server → reader | `MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA`         | `sessionId` plus `keyNo`, `key`, `username`, or `error`                                     |
| Reader → server | `MASS_INTRODUCTION_CARD_AUTH_CONFIRMED`              | `sessionId`, `uid`                                                                          |
| Server → reader | `MASS_INTRODUCTION_RESULT`                           | `sessionId`, `success` plus `username`, `alreadyIntroduced`, `participantCount`, or `error` |
| Reader → server | `MASS_INTRODUCTION_CANCEL`                           | `sessionId`                                                                                 |
| Server → reader | `MASS_INTRODUCTION_END`                              | `sessionId`, `reason` (`expired`, `cancelled`, `revoked`)                                   |

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

## Pairing and session protocol (1.8.0)

Firmware 1.8.0 no longer registers itself with a token (ATT-1165, ATT-1168, ATT-1170,
ATT-1171). A new reader joins through one approval by an admin of a rotating code, then talks to
the server only inside mutually authenticated TLS 1.3. Both run inside the WebSocket at
`/api/attractap/websocket`; the server selects them by WebSocket subprotocol, so a reverse proxy
must pass `Sec-WebSocket-Protocol`.

| Protocol / firmware            | Subprotocol            | Behaviour                                                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token (up to 1.7.x)            | none                   | Plain-text events, token sign-in. Existing token readers keep working and are updated over the air. New readers cannot enroll.                                                                                                                                               |
| `attractap-pairing.v1` (1.8.0) | `attractap-pairing.v1` | Plain-text JSON frames of at most 4 KiB: `hello`, `round`, `nonce`, `reveal`, `accepted`, `failed`, `cancel`. Used only while pairing.                                                                                                                                       |
| `attractap-session.v1` (1.8.0) | `attractap-session.v1` | TLS 1.3 only, mutual authentication, AEAD (AES-128-GCM preferred), no resumption, 0-RTT or renegotiation. Binary WebSocket frames with inner length-prefixed framing, 64 KiB messages. The server is identified by the installation ID in the certificate, not by host name. |
| Legacy `READER_REGISTER`       | none                   | Creates nothing and gets **no reply**, for old and new firmware alike. New firmware without credentials goes straight to pairing.                                                                                                                                            |

| Reader firmware                   | Server with pairing                                                                                                | Older server                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 1.7.x and older, token registered | Works with its token and updates over the air; must then be paired from its row (settings stay locked until then). | Unchanged.                                |
| 1.7.x and older, never registered | Registration gets no reply; update it with the web flasher first.                                                  | Registers as before.                      |
| 1.8.0 and newer, no credentials   | Pairing, then the TLS session.                                                                                     | Cannot pair; needs a server with pairing. |
| 1.8.0 and newer, paired           | TLS session. Never falls back to token or plain channel.                                                           | Cannot connect.                           |

Pairing sequence:

1. The reader opens a WebSocket with `attractap-pairing.v1` and sends `hello` within 30 s: kind
   (`touch` or `lite`), its public key (canonical uncompressed P-256 SubjectPublicKeyInfo,
   91 bytes), firmware name, variant and version. A reader that signed in with a token may add
   the one-time `ticket` it received through `READER_START_PAIRING` when an admin clicked **Pair**
   on its row; that binds the pairing to the existing record.
2. The server sends a `round` immediately and then every 30 s: the installation CA public key,
   a commitment to the server nonce, the app URL (or `null`) and the times until rotation and
   expiry. The reader answers with its own `nonce` (at least 16 random bytes); the server
   `reveal`s its nonce. The reader checks the commitment and, on a mismatch, aborts, closes and
   starts a new request. The reader only follows the server's pace: round numbers must strictly
   increase, a new `round` while the previous one is still unrevealed ends the request, rounds
   closer than 20 s apart (except the first) end it, and one request has at most 22 rounds
   (10 minutes of 30 s rounds plus a margin). Otherwise someone posing as the server could make
   the reader compute codes much faster than the real server rotates them and pick one that
   matches a code of its own. Such an end uses the normal retry back-off (10 s).
3. Both sides derive the code from `SHA-256` of the length-prefixed fields tag, reader key, CA
   key, reader nonce, server nonce (tag `attractap-pairing-code-v1`). The code is the first
   eight bytes as a big-endian integer mod 31^6 in base 31 over `23456789ABCDEFGHJKMNPQRSTUVWXYZ`,
   shown as `XXX-XXX`. For Lite readers, eight colours come from the following digest bytes
   (`uint16` big-endian mod 6 over red, green, blue, yellow, white, magenta). The previous round
   stays valid until the next rotation. `tests/pairing/vectors.json` holds the shared test
   vectors; the API and the firmware host tests run the same file.
4. An admin approves the code once. The server issues the reader certificate, sends `accepted`,
   and the reader pins the CA and opens `attractap-session.v1`. The reader takes `accepted` only
   after a round whose reveal it verified (a code was derived). The first session grant carries
   its reader ID, installation ID and certificate; the reader stores them and the token hash is
   deleted on the server. A token reader keeps its stored token until that grant is verified and
   stored, and only then deletes it. A pending request lasts at most 10 minutes; then the server
   sends `failed` (`expired`) and the reader asks again with the same key. Expiry is not shown as
   a failure (no "Request failed", no red flash); the screen waits for the next code and the Lite
   ring breathes white until the next round.

After pairing (once the reader holds its certificate) the reader never erases its pinned CA or
key because of an unauthenticated message. A TLS failure against the pinned CA shows "Server could
not be verified" on the connecting screen (Lite: a red error flash per attempt) and retries every
30 s; the reader does not enroll again by itself. Two failed handshakes in a row (timeouts,
errors, or a text frame from a server that took the connection for a token reader, as when a
proxy strips `Sec-WebSocket-Protocol`) show "Secure connection failed. Check the server or proxy."
(Lite: red error flash). Both messages clear when a session opens.

A reader that pinned a CA but never completed the first session (no certificate yet) handles an
unverifiable server differently: after 3 such handshakes in a row it forgets the pinned CA (not
its own key) and goes back to its token if it still has one, or to pairing otherwise. The
approval may have come from someone posing as the server, and the reader would otherwise stay
stuck. The channel at boot follows the stored state: a pin means the session, otherwise the token,
otherwise pairing. When an admin removes the pairing, the session ends within 1 s, the reader shows
"Pairing removed", generates a **new** key and returns to pending approval.

Touch variants show the code on the pending-approval screen with a countdown and a QR code of
`<app URL>/?enroll=<code without hyphen>` (dark modules on a white card with a quiet border of at
least 4 modules, light and dark themes). One LVGL QR object (`LV_USE_QRCODE`) is created with the
screen and updated in place with `lv_qrcode_update` on each rotation. Without an app URL, or when
the QR cannot be built (link over 200 bytes), the screen shows the code only. `tests/lvgl-memory`
covers create, update and delete cycles.

Lite variants show the pattern on the LED ring: 8 segments of 3 LEDs, the start segment blinks
and the colours follow clockwise. A slowly breathing white ring means there is no pattern yet
(the pairing request started but no round arrived yet, the connection dropped, or the request
expired). The ring flashes green when the pairing was accepted and red when it failed; a request
that simply expired after 10 minutes does not flash. Rendering lives in `src/led/led_pattern.hpp` (state
`LED_STATE_ENROLLMENT_PENDING`), covered by the host tests in `tests/led-pattern`.

Every variant, including Lite, reports pairing on the serial console: `api.status.get` returns
`status: "pending_approval"` plus the code and the time until rotation, which the web flasher uses
for its **Approve** button. Each new code is also logged on the UART as
`Enrollment: code=K7P-3XQ`. Treat that line as a stable contract: the lab tool
(`apps/attractap-lab/src/attractap_lab/enrollment.py`) parses the `Enrollment: code=` marker
(`ENROLLMENT_LOG_MARKER`) to approve readers without a screen, so do not reword it. Codes, keys,
nonces and tokens are never logged otherwise.

## Secure profile (ATT-1166)

An optional build profile (`sdkconfig.secure`, `-DATTRACTAP_SECURE_PROFILE=ON`) for
readers that an admin converts over the air to Secure Boot v2, release-mode flash
encryption, NVS encryption and locked debug paths. Images are built unsigned; the
API signs them per installation. It is never available for demo variants.

- `ATTRACTAP_SECURE_PROFILE_BUILD "true"` in a variant `.cmake` makes
  `build_firmwares.py` build the secure profile into `build/<variant>-secure/` and run
  `tools/check_secure_profile.py` on it in every CI stage (PR, main, release). These
  images are unsigned and never packaged. Only Touch V2 has it on.
- `ATTRACTAP_SECURE_PROFILE_HARDWARE_TESTED` (all `"false"`) is carried into
  `firmwares.json` and will gate the admin "Secure this reader" action. It can only be
  `"true"` while the variant's secure build is on. Customers see no change until a
  variant is flipped after its hardware run.
- Standard builds refuse every fuse-burning option (Secure Boot, flash encryption, NVS
  encryption, anti-rollback), so a web-flashable image can never burn eFuses.
- `secure-version-floor.txt` must equal `CONFIG_BOOTLOADER_APP_SECURE_VERSION`; CI
  fails if either decreases. The eFuse field has 16 steps: bump only for security fixes.

Build the secure profile locally (always in its own build directory and sdkconfig;
CMake refuses a reused one):

```bash
idf.py -B build/attractap-touch-v2-secure \
  -DSDKCONFIG=$PWD/build/attractap-touch-v2-secure/sdkconfig \
  -DATTRACTAP_VARIANT=attractap-touch-v2 -DATTRACTAP_SECURE_PROFILE=ON build
python3 tools/check_secure_profile.py build/attractap-touch-v2-secure
```

### eFuse key block layout (fixed)

| Block | Content |
| ----- | ------- |
| KEY0 | Secure Boot digest: per-installation signing key |
| KEY1 | Secure Boot digest: recovery key |
| KEY2 | Flash encryption key (XTS-AES-128) |
| KEY3 | DS identity (HMAC key, read-protected) |
| KEY4 | NVS encryption (HMAC key, read-protected) |
| KEY5 | Spare |

### eFuse read protection (RD_DIS)

The bootloader leaves RD_DIS writable. The secure app burns the DS key (KEY3) and the
NVS key (KEY4) read-protected on first boot and then MUST write-protect RD_DIS
(`WR_DIS_RD_DIS`). The server marks a reader secured only after its eFuse report
shows that lock.

Lab secure readers use public keys and development-mode flash encryption; see
`lab/secure-boot/README.md`.

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

### Test hooks (lab builds only)

Hardware-in-the-loop tests can drive the touchscreen and capture what it
shows over the same console. These topics exist only in firmware built with
`-DATTRACTAP_TEST_HOOKS=ON` (display variants; configuring a headless variant
with it fails). Release builds never contain them: the option defaults to
`OFF` and `build_firmwares.py` passes `-DATTRACTAP_TEST_HOOKS=OFF`. Like all
topics except `auth.*`, each command needs the serial PIN in `authCode`.

`-DATTRACTAP_BEEPER_DEFAULT=OFF` turns the beeper off on readers without a
saved beeper setting (new or erased readers). The setting itself still works;
the default is `ON` and release builds pass `ON`. Lab images use both:

```bash
python3 tools/build_individual_ca_certs.py
idf.py -B build/tv2-hooks -DSDKCONFIG=$PWD/build/tv2-hooks/sdkconfig \
       -DATTRACTAP_VARIANT=attractap-touch-v2 -DATTRACTAP_LOG_LEVEL=DEBUG \
       -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF build
(cd build/tv2-hooks && esptool --chip esp32s3 merge-bin -o tv2-hooks-merged.bin @flash_args)
```

Injected touches go through the real LVGL touch input device: while a gesture
runs it replaces the GT911 panel, so clicks, long presses, scrolling, the
maintenance drawer and touch timeouts behave as with a finger. Touch commands
reply after LVGL has processed the whole gesture. Coordinates are display
pixels (480 x 480, origin top left as shown on screen).

| Topic               | Payload (besides `authCode`)                                                                          | Reply                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `ui.widgets.get`    | —                                                                                                     | `{"screen","width","height","widgets":[...]}`               |
| `ui.widgets.tap`    | `text`, optional `match` (`exact`/`contains`), `index` (default 0), `holdMs` (default 60)             | `{"success":true,"widget":{...}}`                           |
| `ui.touch.tap`      | `x`, `y`, optional `holdMs` (1-60000, default 60)                                                     | `{"success":true}`                                          |
| `ui.touch.press`    | `x`, `y`, optional `holdMs`; without it the finger stays down until `ui.touch.release` (at most 60 s) | `{"success":true}` once pressed or, with `holdMs`, released |
| `ui.touch.release`  | —                                                                                                     | `{"success":true}`                                          |
| `ui.touch.swipe`    | `x1`, `y1`, `x2`, `y2`, optional `durationMs` (1-10000, default 300)                                  | `{"success":true}`                                          |
| `ui.screenshot.get` | —                                                                                                     | header, data lines and end line (below)                     |

`ui.widgets.get` lists the visible touchable widgets front to back, in the
order LVGL hit-tests them: system layer, top layer (popups, dialogs), then the
active screen, later children first. `screen` is the router's current screen
name (`Display::transitionToScreen`). A widget is a clickable object that is a
button, switch, checkbox, slider, dropdown, textarea, roller or arc, or has an
event handler; each key of a keyboard or button matrix is its own entry with
type `key` and its `key` index. Example entry:

```json
{
  "type": "lv_button",
  "text": "End session",
  "texts": ["End", "session"],
  "x": 40,
  "y": 380,
  "w": 400,
  "h": 60,
  "cx": 239,
  "cy": 409,
  "hittable": true,
  "disabled": false,
  "checked": false
}
```

`texts` holds the visible label texts inside the widget (labels of nested
touchable widgets belong to those), whitespace collapsed; `text` joins them
with spaces. `x`/`y`/`w`/`h` is the whole widget, `cx`/`cy` the center of its
part not clipped by scrolling parents or the screen edge. `hittable` is true
when a touch at `cx`/`cy` reaches the widget, false when something such as a
popup covers it. `ui.widgets.tap` taps `cx`/`cy` of the `index`-th hittable
widget whose text matches: `exact` (default) means one label text or the joined
text equals `text`, also after removing LVGL symbol icons (Unicode private-use
glyphs, so `Reboot` matches `"\uf011 Reboot"`; icon-only keys such as backspace
`"\uf55a"` match their glyph); `contains` searches the joined text.

```text
CMND ui.widgets.tap {"authCode":"4711","text":"Start"}
RESP ui.widgets.tap {"success":true,"widget":{"type":"lv_button","text":"Start",...}}
CMND ui.touch.swipe {"authCode":"4711","x1":240,"y1":400,"x2":240,"y2":100}
RESP ui.touch.swipe {"success":true}
```

`ui.screenshot.get` renders pending changes, then sends the panel's
framebuffer: little-endian RGB565 pixels, row by row, compressed with
PackBits over pixels (control byte `c < 128`: `c + 1` literal pixels follow;
`c >= 128`: one pixel follows, repeated `c - 126` times):

```text
RESP ui.screenshot.get {"width":480,"height":480,"format":"rgb565-rle","size":30117,"crc32":2860241123,"chunks":40}
RESP ui.screenshot.data {"seq":0,"data":"<base64 of up to 768 bytes>"}
...
RESP ui.screenshot.end {"chunks":40,"crc32":2860241123}
```

`crc32` (zlib) covers the concatenated decoded chunks of `size` bytes. Log
lines of other tasks may appear between the lines; drop the capture and retry
if a sequence number is missing or the checksum differs.
`apps/attractap-lab/src/attractap_lab/reader_screen.py` does that and writes
PNG files.

Errors: `INVALID_PAYLOAD` (missing or out-of-range value), `WIDGET_NOT_FOUND`,
`TOUCH_BUSY` (an open-ended press is still held), `NOT_PRESSED`,
`TOUCH_TIMEOUT`, `SCREENSHOT_UNAVAILABLE`, `OUT_OF_MEMORY`, plus the PIN errors.
The lookup reads LVGL objects only: text drawn without a label (images, canvas
content, button-matrix keys without text) cannot be matched, and keys are
reported without separate hit-testing of overlapping keys.

## Attractap Lite LED Animations

The Attractap Lite variant uses a WS2812 LED ring for status feedback. For a user-facing guide to LED states and triggers, see the [Attractap Lite LED Guide](../../../docs/user/resources/iots/attractap-lite-led-guide.md) in the docs.

### LED States (for developers)

| State                         | Color        | Circular Animation                              | When used                   |
| ----------------------------- | ------------ | ----------------------------------------------- | --------------------------- |
| `LED_STATE_CONFIG_REQUIRED`   | Red / Orange | 3 dots alternating red ↔ orange every 12 phases | Device needs configuration  |
| `LED_STATE_INIT`              | Blue         | 8-LED fading tail moving around ring            | Booting / connecting        |
| `LED_STATE_WAIT_FOR_CARD`     | Green        | 6 segments breathing in/out of phase            | Ready for card tap          |
| `LED_STATE_AUTHENTICATE_CARD` | Cyan         | 6-LED fading tail at double speed               | Card being read             |
| `LED_STATE_NO_RESOURCES`      | Orange       | Full-ring on/off flash every 10 phases          | No resources assigned       |
| `LED_STATE_FIRMWARE_UPDATE`   | Blue / White | Static alternating blue/white pixels            | Firmware update in progress |

### LED Triggers

| Trigger             | Color        | When used                                                        |
| ------------------- | ------------ | ---------------------------------------------------------------- |
| `triggerSuccess()`  | Green        | Auth succeeded; pairing accepted                                 |
| `triggerError()`    | Red flash    | Auth failed; pairing failed; secure session failed (per attempt) |
| `triggerIndicate()` | Yellow flash | Card held too long                                               |
