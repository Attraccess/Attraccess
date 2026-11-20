# Attractap Firmware

Firmware for the Attractap NFC readers (ESP32-S3) and the Attractap BLE Bridge (classic ESP32), built on **ESP-IDF v6.0.2** (`idf.py` + CMake — no Arduino, no PlatformIO).

## Variants

One firmware per hardware flavor, defined by a file in `variants/`:

| Variant                   | Board                          | Hardware                                                                    |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `attractap-touch`         | ESP32-S3 DevKitC (V3 hardware) | ST7701 480x480 RGB panel, GT911 touch, TCA9554 IO expander, PN532 NFC, WiFi |
| `attractap-touch-v2`      | ESP32-S3 DevKitC (V4 hardware) | as above, 16-bit PCA9555-compatible expander @0x24, PN532 @0x64             |
| `attractap-lite-ethernet` | Adafruit Qualia S3             | headless, WS2812 24-LED ring, W5500 ethernet                                |
| `attractap-touch-demo`    | V3 display hardware            | Offline demo API and demo settings                                          |
| `attractap-touch-v2-demo` | V4 display hardware            | Offline demo API, demo settings and power button                            |
| `attractap-bridge-gl-s10` | GL.iNet GL-S10 (classic ESP32) | headless BLE proxy, no NFC; EMAC Ethernet, Wi-Fi fallback, 3 LEDs, button   |

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
available. `attractap-touch-v2-secure-lab-park` is the Touch V2 parking image
with the lab secure profile, for device-lab secure readers (ATT-1166). They set
`set(ATTRACTAP_RELEASE OFF)`, so release builds skip
them even if listed; any variant can use that tag to stay out of releases. The firmware version
lives in `version.txt` — bump it whenever firmware source changes (CI enforces
this).

## Language protocol compatibility and rollback

Firmware 1.6.5 adds English/German display localization. The server sends a
default language in `READER_AUTHENTICATED`, a cardholder language in
`CARD_AUTHENTICATION_DATA` (its verdict after a tap, see
[Card relay protocol](#card-relay-protocol-200)), and default changes through `READER_LANGUAGE`.
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

| Direction       | Event                      | Payload                                                                                                    |
| --------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Server → reader | `MASS_INTRODUCTION_START`  | `sessionId`, `targetName`, `introducerUsername`, `introducerDisplayName`, `remainingMs`                    |
| Reader → server | `CARD_DETECTED`            | `purpose: "mass-introduction"`, `sessionId`, `uid`, `detectionId` (card relay, below)                      |
| Server → reader | `MASS_INTRODUCTION_RESULT` | `sessionId`, `success` plus `username`, `displayName`, `alreadyIntroduced`, `participantCount`, or `error` |
| Reader → server | `MASS_INTRODUCTION_CANCEL` | `sessionId`                                                                                                |
| Server → reader | `MASS_INTRODUCTION_END`    | `sessionId`, `reason` (`expired`, `cancelled`, `revoked`)                                                  |

Since 2.0.0 the server checks each tapped card through the card relay (like a
supervisor card) before it introduces the user; the reader never sees a card key.
Errors stay on the scan screen instead of opening the generic error popup. After each result the screen waits for the next card. A card left on the
reader is not read again. A reader that is busy (someone signed in, another flow
active, a firmware update) replies to `START` with `MASS_INTRODUCTION_CANCEL`.
The cancel button, the local countdown and an `END` for the shown session return
the reader to its normal screens. A disconnect does too. Messages for any other
`sessionId` are ignored. Serial logs mark the transitions:
`MassIntroduction: started session=…`, `MassIntroduction: card uid=…`,
`MassIntroduction: introduced user=… already=… count=…`,
`MassIntroduction: refused session=… reason=…` and
`MassIntroduction: ended reason=… session=…`.

## Card relay protocol (2.0.0)

Firmware 2.0.0 holds no card keys and no card session state (ATT-1145). The server runs all
DESFire EV2/EV3 and NTAG 424 card crypto and the reader relays complete commands (APDUs) between
the server and the card, one at a time. The reader announces this with
`capabilities.cardRelay: true` in its firmware info; the server gives older readers no card
functions and answers their card events with `FIRMWARE_UPDATE_REQUIRED`. The key-carrying events of
firmware 1.x (`CARD_AUTHENTICATION_DATA` with `keyNo`/`key`, enrollment and reset key events,
`REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA` and friends) are gone.

| Direction       | Event                   | Payload                                                                                                                                                                        |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reader → server | `CARD_DETECTED`         | `purpose` (`tap`, `enroll`, `reset`, `supervisor`, `mass-introduction`), `uid` (lowercase hex), `detectionId`, optional `resourceId`, optional `sessionId` (mass introduction) |
| Server → reader | `CARD_APDU`             | `conversationId`, `detectionId`, `seq`, `apdu` (hex, at most 62 bytes)                                                                                                         |
| Reader → server | `CARD_APDU_RESPONSE`    | `conversationId`, `seq`, `response` (hex, the card's answer including status bytes, at most 56 bytes)                                                                          |
| Reader → server | `CARD_REMOVED`          | `conversationId` (the card did not answer: it left the field)                                                                                                                  |
| Server → reader | `CARD_CONVERSATION_END` | `detectionId`, optional `conversationId` (absent when the server refused the card before any command)                                                                          |
| Reader → server | `READER_SESSION_ENDED`  | none: the reader's login ended (logout or timeout), the server forgets the verified user                                                                                       |

Every card presentation gets a new `detectionId` (per boot, counting from 1). The server echoes
it in `CARD_APDU` and `CARD_CONVERSATION_END`, so a late message for an earlier card can neither
take over nor close the conversation of the card on the reader now. The reader runs one
conversation at a time; commands for another `conversationId` or `detectionId`, commands over
62 bytes (the PN532 packet buffer is 64 bytes) and commands without a `CARD_DETECTED` are dropped.
`CARD_APDU` is not acknowledged. While a conversation is open the reader does not probe the card
for presence. It closes the conversation on `CARD_CONVERSATION_END`, when the card stops answering
(`CARD_REMOVED`), when the flow that opened it ends, when `CARD_DETECTED` could not be sent, on a
disconnect, and at the latest after 20 s (the server gives up after 15 s).

The result arrives as the flow's usual event: `CARD_AUTHENTICATION_DATA` (`username`, `language`,
`cardSessionId`, … or `error`) for a tap, `SUPERVISOR_CARD_AUTHENTICATION_DATA`,
`MASS_INTRODUCTION_RESULT`, and `ENROLL_NEW_CARD` / `RESET_NFC_CARD` with `success` or `error`.
`ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO` and `RESET_NFC_CARD` with a `username` keep their 1.x
names but only arm the enrollment and reset screens; the server writes the card through the relay
and reports success only after the card proved the new key or its factory state. Readers send
`CARD_APDU_RESPONSE` without an INFO serial line (DEBUG only); every other event is logged as
`Sending reader event: <TYPE>`.

## Access-only doors (2.6.0)

The resource list marks a door `accessOnly: true` when its only action is Open (a door the reader
can open but never lock or unlatch). A Touch reader shows one full-width Open button for it instead
of Lock, Unlock and Release latch, and a Lite reader opens it on any tap, short or long. Open is sent
as the existing unlock request; the server records it as the door being opened. A resource list
without the field (an older server) means a regular door.

## BLE bridge (2.10.0)

`attractap-bridge-gl-s10` turns a GL.iNet GL-S10 BLE gateway into a headless BLE proxy for plugins
(ATT-1315). The API treats it as a reader that announces `capabilities.ble` v1, so `context.ble` and
`ReaderBleDriver` work through it unchanged. It reports `capabilities.nfc: false` (and no `cardRelay`),
so the API never assigns it a resource or sends it card or resource-list traffic. Every other firmware
reports `nfc: true`; firmware before 2.10.0 omits the field, which means true.

**Target and build.** The variant sets `set(ATTRACTAP_IDF_TARGET "esp32")`; `CMakeLists.txt` passes it to
ESP-IDF as `IDF_TARGET` (default `esp32s3`), and `build_firmwares.py` reads it for esptool `--chip` and
the manifest (`chip`, `boardFamily` `ESP32`, `bleBridge: true`, and the image's own flash settings
`dio`/`40m`/`4MB`). ESP-IDF applies `sdkconfig.defaults.esp32` after `sdkconfig.defaults` for that target
only. (2.7.0 kept the S3 `sdkconfig` byte-identical; 2.8.0 turns the setup's NimBLE options on for the S3
too, see "Bluetooth setup".) The overlay sets 4 MB DIO
flash at 40 MHz, no PSRAM, the BLE-only controller with one connection, Wi-Fi/BT software coexistence,
the UART0 console, the internal EMAC and `partitions-4mb.csv`. The secure profile is refused for this
target.

**Partition layout (`partitions-4mb.csv`).** `nvs` 20 KB at `0x9000`, `otadata` at `0xe000`, two OTA
slots of `0x1f0000` (1.94 MB) at `0x10000` and `0x200000`, and a 64 KB `coredump` at `0x3f0000`. No
SPIFFS. The bootloader sits at `0x1000` on the classic ESP32. `tools/check_release_build.py` fails a
release image that leaves less than 10 % of its smallest app slot free. Release build (log level
ERROR, with the Bluetooth setup, measured before 2.10.0): app image 1,543,312 bytes (24 % of the slot free, 477 KB),
static DRAM 67.4 KB, IRAM 91 %, bootloader 26,096 bytes (9 % of its 28 KB free).

**PSRAM.** Not used. The S10 drives the 50 MHz RMII reference clock out on GPIO17, which the ESP32's
external PSRAM needs as its clock pin, so PSRAM and Ethernet cannot run together. The proxy's bulk
buffers, its task stack, NimBLE (`CONFIG_BT_NIMBLE_MEM_ALLOC_MODE_INTERNAL`) and mbedTLS use internal
RAM, and the variant defines `BLE_PROXY_INTERNAL_RAM`, which lowers the bounds the capability reports:
16 scan results, 32 scan candidates, a 32-entry / 8 KB notification queue and 16 watched devices
(MTU 517 and 512-byte payloads stay). `tests/ble-proxy` runs every proxy test with both sets of bounds.

**RAM budget.** Without PSRAM, Wi-Fi, lwIP, two TLS contexts (the wss connection and the reader
session), the websocket tasks and NimBLE share roughly 160 KB of heap. With the stock sizes the first
plugin BLE scan could not even create the 4 KB NimBLE host task (`ble init failed detail=host-task`),
and the websocket then ran out of memory too. `sdkconfig.defaults.esp32` trims the bridge only (each line
there says why): 5 static Wi-Fi RX buffers and 12 dynamic RX/TX, no TX aggregation, an RX block-ack
window of 4, no soft-AP; mbedTLS dynamic buffers (records allocated per use instead of 8 + 4 KB held per
context) with 2 KB outgoing records, and no IDF certificate bundle (the wss connection uses the
firmware's own CA list); NimBLE mbuf pools of 8x256 + 12x320 B, 10 ACL and 16 HCI event buffers. The
incoming TLS record limit stays 8 KB because reverse proxies in front of the API do not negotiate a
smaller one. A NimBLE init that runs out of memory now hands everything back at once
(`ble_radio_nimble.cpp`), so the websocket keeps its memory and the next request retries. The bridge
skips the beeper task. `CMND heap` (no PIN, release builds too) answers with the internal heap now, its
minimum since boot, its largest block, the DMA-capable heap and the unused stack of the firmware's
tasks; the bridge logs no heap figures at log level ERROR. First release build on a GL-S10 (rev v1.0),
Wi-Fi up, no API session: 73,068 B free, 53,896 B minimum, largest block 69,632 B.

Hardware QA of 2.7.0 then showed two aborts and a tight budget. With a session and a GATT session up,
the minimum free heap fell to about 8 KB, and a failed allocation reboots the reader: the firmware builds
without C++ exceptions, so a failed `new` or container growth calls `abort()`. Since 2.10.0:

- **Heap guard** (`src/heap_guard.hpp`). Work that grows on behalf of the network first checks the largest
  free block and keeps a reserve (8 KB for bulk BLE work, 2 KB for received TLS bytes). The proxy refuses a
  scan, a session open, a queued operation or a read with `READER_BUSY` `memory`, which the API retries
  like any busy reader. It skips advertising reports and builds a scan result only with room for it,
  reserves the scan's candidate list, a session's subscriptions and a long read's value up front, and
  lets notifications wait in, or overflow, their bounded buffer. `tests/ble-proxy/ble_memory_test.cpp`
  drives each path with a short heap.
- **Received TLS bytes** (`session_tls.cpp`). The buffer drops what TLS already read before new bytes are
  appended, frees a large buffer (an OTA chunk) once it has been read, and fails the session instead of
  aborting when the heap has no room. The reader then opens a new session.
- **Session records wait for the websocket** (`src/api/security/session_outbox.hpp`). A TLS record of
  the secure session has used its sequence number, so the reader reconnected whenever the websocket's
  8-slot send queue was full or the copy found no heap: under a long BLE transfer a few seconds of TCP
  back-pressure dropped the connection. Refused records now wait, in order, and leave from the main loop
  once there is room; senders are refused before TLS while they wait or the queue has no slot. Only a
  backlog the websocket takes nothing of for 20 s (its liveness limit) or one past 16 KB ends the session.
  `tests/pairing/session_outbox_test.cpp` replays a 6 s stall and a failed copy mid-transfer.
- **Stacks, bridge only**, sized from the QA high-water marks plus about 2 KB: `main` 13 KB (was 12 KB,
  1.1 KB left after an Ethernet boot), `websocket_task` 8 KB (was 16 KB, about 1.5 KB used), `rl_tls`
  9 KB (was 16 KB, 5.3 KB used), `ws_conn` 4 KB (was 8 KB, 1.9 KB used) and the proxy's `nimble_host`
  4.75 KB (was 4 KB, 1.4 KB left). The S3 readers keep their sizes. QA measured these figures against a
  local `ws://` API. Behind `wss://` the websocket task also runs the outer TLS handshake.
- **Ethernet unplug.** The EMAC release removes the netif glue before uninstalling the driver, then
  deletes the MAC and PHY. Before, the uninstall failed ("2 ethernet reference in use"), the next init
  could not claim the SMI pins, and every reinit leaked the EMAC's DMA buffers.

**Ethernet with Wi-Fi fallback.** Internal EMAC over RMII: MDC GPIO23, MDIO GPIO18, clock out on GPIO17
(`EMAC_CLK_OUT`), PHY power/reset GPIO5. LAN8720 (v1.x units) and IP101 (v2.x units) both run with
the generic IEEE 802.3 PHY driver at whatever MDIO address answers; the log names the PHY from its ID
registers. Ethernet is preferred: Wi-Fi stays in standby until Ethernet has had no link or no IP address
for 30 s and Wi-Fi credentials exist, and it disconnects as soon as Ethernet has a link and an IP again
(`src/bridge/bridge_logic.hpp`, `Network::loop`). Credentials saved while Ethernet is up are used the
next time Ethernet is gone.

**LEDs and button** (`src/bridge/`, all active low). Power GPIO14: on while the firmware runs. Network
GPIO32: on = API websocket connected, 1 s blink = network up without the API, 200 ms blink = no network.
BT GPIO12: on = a session holds (or opens) a connection, 1 s blink = a scan or the advertisement watch
runs, off = idle; during the Bluetooth setup two short flashes every 1.5 s = waiting, on = the web app is
connected. Button GPIO33: a press shorter than 2 s reboots; after 3 s all LEDs blink fast; releasing
between 3 and 10 s asks for the Bluetooth setup; at 10 s the bridge erases NVS (Wi-Fi, API address,
pairing credentials, PIN), lights all LEDs and reboots unconfigured. Releasing between 2 and 3 s does
nothing. GPIO0 stays the download button.

**Bluetooth setup** (shared with the readers, see "Bluetooth setup (2.8.0)"). On a bridge without pairing
credentials, releasing the button after 3 s opens a 10-minute window, advertised as `Attractap Bridge XXXX`. A
bridge that is paired ignores the 3 s hold. If the proxy already holds NimBLE (a bridge unpaired at runtime), the
setup fails to open until a reboot.

**Serial setup.** The Bluetooth setup is the alternative that needs no open case. The classic ESP32 has no USB-Serial-JTAG. The console and the Serial Configurator
protocol run on UART0 (GPIO1/3, 115200 8N1) through a 3.3 V USB-TTL adapter on the serial pads
(`src/serial/console_io.hpp`). The micro-USB port only powers the S10.

**Updates.** The first flash goes over the serial pads (GPIO0 held at power-up); every later update is
the regular websocket OTA of `attractap_bridge_gl_s10_ota.bin`, with rollback/confirm as on the readers.

**Secure boot and flash encryption (plan only, no build).** The bridge runs unfused and without the
secure profile; development units stay unfused. A later secure bridge build needs:

- Secure Boot v2 (RSA-PSS), which the classic ESP32 supports only from chip revision v3.0 (ECO3).
  Record each unit's revision before planning (`esptool --chip esp32 chip_id` prints it):

  | Unit | Chip revision | PHY | PSRAM |
  | ---- | ------------- | --- | ----- |
  | (filled in during the first-deployment QA) | | | |

- Flash encryption (release mode) with a per-device key, NVS encryption with the flash-encryption-based
  scheme (the classic ESP32 has no HMAC peripheral), and a disabled ROM download mode / JTAG.
- Room for the bootloader: it starts at `0x1000` and must end before the partition table at `0x8000`
  (28 KB). The plain bootloader already uses 26 KB, and the S3 secure bootloader only fits its budget
  with logs off, so expect to move the partition table (and so change the flash layout of fielded
  bridges, which needs a serial reflash) or to strip the bootloader hard.
- Rev < v3.0 units can never get Secure Boot v2; they stay development-only.

Installations that rely on the reader secure profile get bridges without it; physical access to a
bridge exposes its flash, including its pairing credentials.

## Bluetooth setup (2.8.0)

`src/bt_setup/` (ATT-1315 for the bridge, ATT-1371 for the readers): the web app's **Set up over Bluetooth**
sets the PIN, Wi-Fi and server address of a device that is not paired yet. Every variant with NimBLE and an API
has it (the condition of the BLE proxy, `ATTRACTAP_BT_SETUP`): Touch, Touch V2 (also the secure profile), Lite
and the bridge. The demo variants, the park images and the desktop simulator get stubs.

**Window** (`bt_setup_logic.hpp`, `SetupWindow`). It opens only while `CredentialStore::load().paired()` is
false and stays open 10 minutes. It closes 10 s after the reader runs an authenticated session (so the web app
reads the new status first), when it times out, or with a reboot; nothing is persisted. A request while it is open
changes nothing. Who opens it:

- Touch / Touch V2: at every boot while unpaired (`Application::tickBtSetup`, first main-loop pass), and the **Bluetooth setup**
  button next to **Settings** on `InitScreen` (shown only while unpaired and no window is open; no PIN, the commands
  check it). If NimBLE cannot start, the button shows "Bluetooth unavailable". While the window is open,
  `InitScreen` and the pairing-code screen show "Bluetooth setup open · mm:ss · Attractap Touch XXXX", or
  "Bluetooth setup: browser connected" (`display/shared/btSetupStatus.hpp`, `messages.catalog.bt-setup.hpp`).
- Lite: at every boot while unpaired. The ring shows `LED_STATE_BT_SETUP` (`led/led_bt_setup.hpp`): two short
  blue pulses every 1.5 s over a dim ring, steady blue with a browser connected. It replaces Configuration Required
  and Initializing; the pairing pattern takes priority.
- Bridge: the 3 s button hold (above); the bridge runs the window on its button task, the readers on the main loop.

A configuration that arrives over USB or Bluetooth while the reader shows "not configured" now leaves that state
by itself (`Application::settingsOpenedByUser` keeps settings the user opened on screen until saved or cancelled).

**Service.** NimBLE comes up as a peripheral under a new random static address and advertises service
`2665a001-44cd-4fe2-a450-916b627619d7`, with `<BT_SETUP_NAME_PREFIX> XXXX` (last two bytes of the BT MAC, at most
29 characters) in the scan response; the variant files set the prefix. RX `...a002` (write, encrypted link
required) takes the bytes of Serial Configurator lines (`CMND <topic> <json>\n`, a line may span several writes, at
most 256 bytes; a longer one is dropped whole); TX `...a003` notifies the replies (`RESP <topic> <json>\n`, split
into ATT MTU - 3 pieces). The lines run through `SerialCommandHandler` on the main loop with the serial PIN rules
(`SerialCommandHandler::Channel`). Pairing is LE Secure Connections, Just Works, without stored bonds. The host task
stack (4 KB) comes from PSRAM where there is some.

**NimBLE ownership.** While the window is open the BLE proxy refuses to start (`READER_OFFLINE` `bt-setup`,
retryable). Closing drops the link, stops advertising, frees NimBLE and restores `ble_hs_cfg` as it was before the
setup (pairing settings, bond store, callbacks), so the proxy brings NimBLE up again as a plain central without a
reboot.

**sdkconfig (S3).** `sdkconfig.defaults` turns on the peripheral and broadcaster roles, NimBLE security with SM SC
only (no legacy pairing, no signed writes), no NVS persistence of bonds, the controller's advertising and BLE
security, and leaves NimBLE's example GATT services out. NimBLE memory stays in PSRAM
(`CONFIG_BT_NIMBLE_MEM_ALLOC_MODE_EXTERNAL`). The options also apply to paired readers that never open a window;
image sizes are in the PR of ATT-1371. `sdkconfig.defaults.esp32` keeps the bridge's own values.

**Secure profile.** Secure builds keep the setup: the command handler is compiled in, but only for the Bluetooth
channel. The console stays off (`CONFIG_ESP_CONSOLE_NONE`): `CMakeLists.txt` leaves out
`src/serial/serialConsoleInput.cpp` (the console reads), and `ATTRACTAP_SECURE_PROFILE=1` drops the console driver
in `main.cpp` and the console fallback of the replies. `tools/check_secure_profile.py` fails a secure build that
compiles the console input, lacks the define on an app source, lacks `src/bt_setup/bt_setup.cpp`, or has the crash
trigger or the test hooks.

Host tests: `tests/bt-setup` (window, triggers, name, countdown, line assembly, chunking, the Lite ring);
`tests/bridge` keeps the bridge's button, LEDs, Wi-Fi fallback and PHY.

## BLE proxy protocol (2.5.0)

Firmware 2.5.0 lets server plugins with the `BLE_TRANSPORT` permission talk to Bluetooth Low Energy
devices through the reader (ATT-1033, ATT-1036). The reader is a bounded proxy, not a raw GATT
gateway: the server opens a session for one device and sends the profile with it as an allowlist,
and the reader refuses everything outside it before it touches the radio. The reader announces
`capabilities.ble` (protocol `version: 1`, the supported operations and its limits) in its firmware
info; the server answers readers without it, or with another version, with `READER_UNSUPPORTED`.
Demo variants, park images and the desktop simulator announce no `ble`. BLE works only on paired
readers: the reader accepts BLE requests only on the secure link (see "Pairing and session
protocol" below) after it signed in, and refuses them on the pairing channel and before
sign-in. A reader without a certificate cannot connect except to pair, so the server never
sends BLE requests to a reader that is not on the secure link.

| Direction       | Event               | Payload (besides `v: 1` and `sessionId`)                                                                                   |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Server → reader | `BLE_SCAN`          | `requestId`, `durationMs` (≤ 15 s), `filter` (`serviceUuids`, `manufacturerIds`, `namePrefix`), `maxResults` (≤ 32)        |
| Server → reader | `BLE_SESSION_OPEN`  | `requestId`, `address`, `addressType`, `connectTimeoutMs`, `leaseMs`, `allowlist` (≤ 16 entries `{s, c, ops, r, w, n}`)    |
| Server → reader | `BLE_READ`          | `requestId`, `s`, `c`, `timeoutMs`                                                                                         |
| Server → reader | `BLE_WRITE`         | `requestId`, `s`, `c`, `value` (base64, ≤ 512 bytes), `withoutResponse`, `timeoutMs`                                       |
| Server → reader | `BLE_SUBSCRIBE`     | `requestId`, `s`, `c`, `indicate`, `timeoutMs` (the reader writes the CCCD)                                                |
| Server → reader | `BLE_UNSUBSCRIBE`   | `requestId`, `s`, `c`, `timeoutMs`                                                                                         |
| Server → reader | `BLE_CANCEL`        | `requestId` of the request to abandon (no answer of its own)                                                               |
| Server → reader | `BLE_SESSION_CLOSE` | `requestId`                                                                                                                |
| Reader → server | `BLE_RESULT`        | `requestId`, `ok`, then `value` (read) or `mtu` (open), or `error` `{code, detail}`                                        |
| Reader → server | `BLE_SCAN_RESULT`   | `requestId`, `ok`, `advertisements` (deduplicated by address) or `error`                                                   |
| Reader → server | `BLE_NOTIFICATION`  | `subscriptionId` (the subscribe's `requestId`), `seq` (1, 2, … without gaps), `value` or a stream-ending `error`           |
| Reader → server | `BLE_SESSION_ENDED` | `reason` (`disconnected`, `lease-expired`, `timeout`, `ota`, …), `detail`                                                  |
| Server → reader | `BLE_WATCH_SET`     | no `sessionId`: `requestId`, `filters` (≤ 8 `{id, serviceUuids, manufacturerIds, namePrefix}`), `keepaliveMs` (1 s to 1 h) |
| Reader → server | `BLE_WATCH_STATE`   | no `sessionId`: `requestId` (none when unsolicited), `ok`, then `active` and `detail`, or `error`                          |
| Reader → server | `BLE_WATCH_EVENT`   | no `sessionId`: `events` (≤ 8), each `filters` (matching ids), the `BLE_SCAN_RESULT` advertisement fields and `changed`    |

None of these is acknowledged. Every request gets exactly one answer (`BLE_WATCH_SET` gets a
`BLE_WATCH_STATE`); error codes are the plugin codes of the SDK (`READER_BUSY`,
`OPERATION_NOT_ALLOWED`, `GATT_ERROR`, …) and `detail` carries the raw radio reason as text (`nimble:rc=<n>`, `hci:0x<xx>`, `att:0x<xx>`, `reason:0x<xx>`),
never payload bytes. Requests with another `v` are refused.

**Architecture.** `src/ble_proxy/`: the websocket task only parses a request and queues it (bounded
queue) for the `ble_proxy` task, which runs the state machine (`ble_core*.cpp`); NimBLE's host task
reports radio events back through a second queue. The state machine, allowlist, codec, deadlines,
notification buffer, advertisement watch (`ble_watch.cpp`) and error mapping are free of NimBLE and FreeRTOS and covered by host tests
(`tests/ble-proxy`); `ble_radio_nimble*.cpp` is the only NimBLE code.

**Rules.** One owner at a time: a scan or one session (`CONFIG_BT_NIMBLE_MAX_CONNECTIONS=1`); a
second open or scan gets `READER_BUSY`. Operations run one at a time in order, at most 16 queued
per session (announced as `maxPendingRequests`; more get `READER_BUSY` `queue-full`). The reader
keeps its own deadlines: the lease plus 10 s (counted from when the connection was established),
each operation's `timeoutMs` plus 2 s, and the connect timeout. An operation past its deadline is
answered `TIMEOUT` and the session stays open. A GATT procedure NimBLE cannot abort is answered
`CANCELLED` or `TIMEOUT` at once; its late result is discarded and the next operation waits until
NimBLE finished. The reader ends the session itself only when the lease expires or NimBLE has not
finished a GATT procedure after about 35 s. Writes without response
retry on full controller buffers until their deadline. The reader requests MTU 517 and reports the
negotiated MTU; writes with response above `mtu - 3` use long writes. Notifications are buffered per
session (128 entries, 32 KiB) and forwarded with `seq`; overflow (`NOTIFICATION_OVERFLOW`,
`reader-buffer`) or an oversized notification (`PAYLOAD_TOO_LARGE`, `max-notification`) ends that
stream with an `error` instead of dropping data. A read result above its bound is answered
`PAYLOAD_TOO_LARGE` (`max-read`). Scans deduplicate by address; a scan filter takes at most 8
service UUIDs, 8 manufacturer ids and a name prefix of 64 bytes (larger filters get
`INVALID_ARGUMENT`); advertised names are at most 31 bytes, so longer prefixes never match. Losing the websocket, switching to pairing or
the secure link, re-authenticating, and starting an OTA end the session and disconnect the device at
once; BLE requests during an OTA get `READER_BUSY` (`ota`).

**Link (2.5.1).** For bulk transfers (ATT-1296) the reader connects with a 15 ms connection
interval (NimBLE's default is 30–50 ms; latency 0, supervision timeout 2.56 s; a 15–30 ms range
ended at 30 ms, because the controller picks its top), then asks for the largest LE data length
(251 bytes) (`src/ble_proxy/ble_link.hpp`). These are requests: a peripheral that refuses them, or
later asks for other connection parameters (accepted as they are), keeps a working session with
whatever it ends up with. Every change logs the negotiated values at info
(`ble link <what> interval=… latency=… timeout=… data=tx…/rx… phy=tx…/rx…`), a refused request at
warn. The reader does not ask for the 2M PHY: on the lab reader the request changed nothing and
throughput stayed the same, because the round trip is the websocket's, not the radio's. Each
session end also logs `retries` (writes without response NimBLE refused for lack of buffers) and
`queued` (answers that waited for room in the websocket send queue). A write waiting for
controller buffers is retried every 2 ms (NimBLE reports no buffers freeing); the proxy task wakes
as soon as the websocket frees a send slot while it waits for one
(`IReaderTransport::setSendSlotFreedCallback`). Otherwise it polls every 20 ms only for deadlines,
and without BLE work it still sleeps until a request arrives.

**Advertisement watch.** Since 2.6.0 the reader also announces `capabilities.ble.watch`
(`version: 1`, `maxFilters: 8`, `maxDevices: 32`, `maxEventsPerSecond: 20`) and can watch
advertisements continuously for the server. `BLE_WATCH_SET` replaces the reader's whole filter set
(the server sends the union of all watches on the reader); `filters: []` stops the watch. A filter
matches like the scan filter, under the `id` the server chose. While at least one filter is set, the
reader scans passively (no scan requests, so names only from the advertising data) and keeps a table
of at most 32 matching devices (the device seen longest ago makes room). Per device it compares the
manufacturer data, name and service UUIDs, never the RSSI: a device that first matches or whose data
changed is reported at once with `changed: true`, and one that is still seen and unchanged is reported
again every `keepaliveMs` with `changed: false`. Events go out at most every 50 ms, at most 8 per
message and at most 20 per second per reader; changes go before keepalives. Like notifications,
events only use room the websocket send queue has to spare: while it is full, keepalives are dropped
and changes wait. The watch is no owner: it runs beside a session (scanning 30 ms of every 200 ms
while a device is connected, 30 ms of every 100 ms otherwise, which leaves air time for the
connection and Wi-Fi), pauses while a connection is being established (NimBLE cannot scan and connect
at once) and while an on-demand `BLE_SCAN` runs (whose reports it still uses), and resumes
afterwards. `BLE_WATCH_STATE` answers whether it scans right now (`active`, with the reason in
`detail` when not, e.g. `connecting`); the reader also sends one without `requestId` when the watch
stops or runs again for its own reasons (`ota`, a radio failure, which it retries every 2 s). An OTA
pauses the watch; losing the websocket ends it, and the server sends its filter set again on the
next connection. A first non-empty filter set brings NimBLE up like any other BLE request; an empty
one never does.

**Memory.** NimBLE (central and observer roles only, no security) starts lazily on the first BLE
request, so readers that never use BLE keep their RAM and radio as before. It is released again
after 30 s without BLE work (`STACK_IDLE_SHUTDOWN_MS` in `ble_types.hpp`): no scan or session, no
request or answer waiting, no undelivered notification, and nothing the controller still runs (a
scan, a connect, or a link it has not let go yet). The release stops the host (`nimble_port_stop`),
ends NimBLE's host task and deinitialises host and controller (`nimble_port_deinit`), which gives the
controller's ~24 KB of internal RAM back; the next request brings a fresh stack up first, so it
takes the init time on top. A lock plugin's exchange when a usage session starts holds the RAM for
the exchange plus 30 s, and the one when it ends brings the stack up again. The reader never calls
`esp_bt_controller_mem_release`: it is one-way and would keep the controller from starting again.
The stack starts only with at least 40 KB of DMA-capable internal RAM free
(`STACK_MIN_FREE_INTERNAL` in `ble_radio_nimble.cpp`); with less the request fails with
`READER_OFFLINE` (`ble init failed detail=low-memory` in the log) and the next one tries again.
Espressif's controller does not check every allocation: started with 20 KB free it asserted and the
reader restarted.
Host memory and the proxy task stack live in PSRAM; the controller runs from flash
(`CONFIG_BT_CTRL_RUN_IN_FLASH_ONLY`). The proxy logs the internal heap and its largest free block at
boot, after every BLE init (`Heap after BLE init`) and after every release (`Heap after BLE
shutdown`). Init failure is reported as `READER_OFFLINE` (`ble-init-failed`), never stops the
reader, and the next request tries again.

**Logs.** Each scan, operation and session end logs the session id, operation, outcome, NimBLE code
and duration, never payload bytes. The watch logs its filter count, starts, stops and radio failures,
never advertisement data. Successful operations log at debug level, cancels and expected session ends at info, failures,
allowlist rejections and notification failures at warn, and an init failure at error.

**Trust boundary.** The allowlist protects devices against bugs in the server, not against a
compromised server, which can send any allowlist. The reader stores no device credentials. The
BLE link itself has no Bluetooth-level security: NimBLE is built without it
(`CONFIG_BT_NIMBLE_SECURITY_ENABLE` off), so the reader never pairs or bonds and the radio traffic
is not encrypted. Plugins must encrypt and authenticate sensitive payloads in their own protocol.
Only the reader-server hop is protected, by the secure link.

## Pairing and session protocol (2.6.0: the only way in)

A reader joins through one approval by an admin of a rotating code, then talks to the server only
inside mutually authenticated TLS 1.3 with its own P-256 key (ATT-1165, ATT-1168, ATT-1170,
ATT-1171). Both run inside the WebSocket at `/api/attractap/websocket`; the server selects them by
WebSocket subprotocol, so a reverse proxy must pass `Sec-WebSocket-Protocol`.

**Firmware 2.6.0 has no token sign-in at all** (ATT-1207). There is no token to enter, store or
send, no serial command or screen field for one, and no plain-text channel. A reader without a
certificate starts pairing; a paired reader only uses the session. The server no longer knows
readers that signed in with a token or that paired with an older server: after the upgrade every
reader pairs again, from the pairing screen, like a new reader.

| Protocol               | Subprotocol            | Behaviour                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attractap-pairing.v1` | `attractap-pairing.v1` | Plain-text JSON frames of at most 4 KiB: `hello`, `round`, `nonce`, `reveal`, `accepted`, `failed`, `cancel`. Used only while pairing.                                                                                                                                       |
| `attractap-session.v1` | `attractap-session.v1` | TLS 1.3 only, mutual authentication, AEAD (AES-128-GCM preferred), no resumption, 0-RTT or renegotiation. Binary WebSocket frames with inner length-prefixed framing, 64 KiB messages. The server is identified by the installation ID in the certificate, not by host name. |

| Reader firmware                            | Server (2.6.0 generation)                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.6.0 and newer, no credentials            | Pairing, then the TLS session.                                                                                                                                                      |
| 2.6.0 and newer, paired                    | TLS session. Never falls back to another channel.                                                                                                                                   |
| Older than 2.6.0, token registered         | Cannot connect. It cannot update over the air either (the update runs over the authenticated connection): flash 2.6.0 over USB (web flasher), then pair it.                         |
| 1.8.0 to 2.5.x, paired with the old server | The server no longer knows its certificate and ends the session (`session.rejected`); the reader shows "Pairing removed" and pairs again. It keeps updating over the air as before. |

A reader moved to another server pairs there with its existing key; clear it on the old server
and pair it again (pairing screen), nothing else is needed.

Pairing sequence:

1. The reader opens a WebSocket with `attractap-pairing.v1` and sends `hello` within 30 s: kind
   (`touch` or `lite`), its public key (canonical uncompressed P-256 SubjectPublicKeyInfo,
   91 bytes), firmware name, variant and version.
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
   its reader ID, installation ID and certificate; the reader stores them. A pending request lasts at most 10 minutes; then the server
   sends `failed` (`expired`) and the reader asks again with the same key. Expiry is not shown as
   a failure (no "Request failed", no red flash); the screen waits for the next code and the Lite
   ring breathes white until the next round.

After pairing (once the reader holds its certificate) the reader never erases its pinned CA or
key because of an unauthenticated message. A TLS failure against the pinned CA shows "Server could
not be verified" on the connecting screen (Lite: a red error flash per attempt) and retries every
30 s; the reader does not enroll again by itself. Two failed handshakes in a row (timeouts,
errors, or a text frame from a server that did not speak TLS to the reader, as when a
proxy strips `Sec-WebSocket-Protocol`) show "Secure connection failed. Check the server or proxy."
(Lite: red error flash). Both messages clear when a session opens.

A reader that pinned a CA but never completed the first session (no certificate yet) handles an
unverifiable server differently: after 3 such handshakes in a row it forgets the pinned CA (not
its own key) and asks to be paired again. The
approval may have come from someone posing as the server, and the reader would otherwise stay
stuck. The channel at boot follows the stored state: a pin means the session, otherwise pairing. When an admin removes the pairing, the session ends within 1 s, the reader shows
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
nonces are never logged otherwise.

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
- No TLS key material in PSRAM: mbedTLS keys, secrets, bignums, PK and cipher contexts
  and handshake state stay in internal RAM. Only the two fixed record buffers of each TLS
  session (ciphertext and decrypted application data, about 13 KB per session) go to
  PSRAM, which flash encryption also encrypts, and fall back to internal RAM when PSRAM
  is full. Standard builds keep all mbedTLS memory in PSRAM
  (`CONFIG_MBEDTLS_EXTERNAL_MEM_ALLOC`). The secure profile uses
  `CONFIG_MBEDTLS_CUSTOM_MEM_ALLOC` with the allocator in `src/api/security/tls_memory.c`,
  which matches the exact record buffer lengths (`tests/tls-memory` checks this through
  real handshakes). The link fails without the allocator, and
  `tools/check_secure_profile.py` keeps the option set, the dynamic and variable-length
  buffer options off and the allocator compiled in and linked.

Build the secure profile locally (always in its own build directory and sdkconfig;
CMake refuses a reused one):

```bash
idf.py -B build/attractap-touch-v2-secure \
  -DSDKCONFIG=$PWD/build/attractap-touch-v2-secure/sdkconfig \
  -DATTRACTAP_VARIANT=attractap-touch-v2 -DATTRACTAP_SECURE_PROFILE=ON build
python3 tools/check_secure_profile.py build/attractap-touch-v2-secure
```

### eFuse key block layout (fixed)

| Block | Content                                                              |
| ----- | -------------------------------------------------------------------- |
| KEY0  | Secure Boot digest: per-installation signing key                     |
| KEY1  | Secure Boot digest: recovery key                                     |
| KEY2  | Flash encryption key (XTS-AES-128)                                   |
| KEY3  | Spare (no Digital Signature key: the reader identity is a P-256 key) |
| KEY4  | NVS encryption (HMAC key, read-protected)                            |
| KEY5  | Spare                                                                |

### eFuse read protection (RD_DIS)

The bootloader leaves RD_DIS writable so the NVS key (KEY4) can be burned read-protected
after Secure Boot is on; RD_DIS then MUST be write-protected (`WR_DIS_RD_DIS`). The server
marks a reader secured only after its eFuse report shows that lock.

### eFuse report and profile claims (ATT-1207)

The firmware never writes an eFuse. Secure builds only read them: once per session, right after
`READER_FIRMWARE_INFO`, the reader sends one `efuse.report` control frame inside the TLS session
(`src/api/security/efuse_report.cpp`, `efuse_snapshot.cpp`). It lists, per key block, the purpose
and whether it is used or read-protected, the two public Secure Boot digests (never any key
material), the revoke bits, the flash-encryption counters and mode, the JTAG and download
protections, `RD_DIS` and its write protection, and the eFuse `SECURE_VERSION`. Plain builds send
no report. `READER_FIRMWARE_INFO` adds the build's claims `profile` (`plain`, `secure`,
`secure-lab`), `release` and, on secure builds, `secureVersion`. The server treats all of it as a
claim; only a release secure build whose report passes and whose session uses the paired
certificate counts as secured. The lab reader (`secure-lab`, development-mode flash encryption)
is expected to report _not secured_. `tests/efuse-report` checks the message format on the host.

Lab secure readers use public keys and development-mode flash encryption; see
`lab/secure-boot/README.md`.

## Building

Prerequisites: [ESP-IDF v6.0.2](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/get-started/index.html) installed for the `esp32s3` and `esp32` targets (the BLE bridge is a classic ESP32). Install the project-local toolchain at `.tools/esp-idf` with `pnpm nx run attractap-firmware:setup-toolchain`, or use `INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh --workspace-only` during bootstrap. Local setup and CI share `tools/setup-esp-idf.sh` and the pin in `esp-idf-version.txt`; setup repairs partial installs and verifies `idf.py` can run. No extra Python packages are needed — `esptool` is picked up from your `PATH` or from ESP-IDF's own Python environment, and `cmake`/`ninja` are installed into the IDF tool set automatically if your system lacks them.

NixOS note: Espressif's prebuilt binaries (xtensa toolchain, cmake, ninja) are dynamically linked against FHS paths, so they need `programs.nix-ld.enable = true;` (or an FHS environment like `steam-run`) to execute.

Build the five active variants: `attractap-touch`, `attractap-touch-v2`, `attractap-touch-demo`, `attractap-touch-v2-demo` and `attractap-bridge-gl-s10` (also what CI and `pnpm nx run attractap-firmware:build` run). Other variants remain available for manual builds; uncomment them in `build_firmwares.py` to ship them again:

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
`firmware_output_lab/<name>.bin`, one merged image per hardware family.
Variants that set `ATTRACTAP_SECURE_LAB "true"` are signed with the public lab
key instead and written as `firmware_output_lab/<name>.hex` (Intel HEX, for
`esptool write-flash --encrypt` on a lab secure reader):

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

### Internal RAM and PSRAM

Internal RAM is the scarce resource; PSRAM has megabytes to spare. `sdkconfig.defaults` sets:

- `CONFIG_SPIRAM_XIP_FROM_PSRAM`: code and read-only data run from PSRAM, so NVS and OTA flash
  writes no longer disable the cache.
- `CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=1024`: plain `malloc()` tries internal RAM first only for
  blocks up to 1 KB; larger ones (JSON documents, message buffers, lwIP packet buffers, the Wi-Fi
  driver's non-DMA blocks) go to PSRAM first. Memory that must be internal (DMA buffers, task
  stacks, FreeRTOS objects, mbedTLS on the secure profile) is requested with `MALLOC_CAP_INTERNAL`
  or `MALLOC_CAP_DMA`.

Task stacks in PSRAM (`createPsramTask()` in `src/psram_task.hpp`, or
`xTaskCreatePinnedToCoreWithCaps` directly): `ws_conn`, `ws_tx`, `NetworkTask`, `rl_tls`,
`ble_proxy` and `nimble_host`. `ws_conn` and `NetworkTask` read and write NVS, which is
only safe with XIP from PSRAM (the sources refuse to build without it). A task on a PSRAM stack
must never map flash (`esp_partition_mmap`, OTA image verification, reads of an encrypted
partition such as `otadata` on the secure profile): ESP-IDF asserts that the stack is in internal
RAM while the cache is frozen for the mapping. The main task, `LvglTask`, `LedTask`, `Beeper` and
the `esp_websocket_client` task (`websocket_task`, 16 KB, created by the component with plain
`xTaskCreate`; no released component version can put it in PSRAM) keep internal stacks.

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
SupervisionFlow logic tests, the UTF-8-safe text copy used for server-supplied names (`tests/text`:
display names are cut to 79 bytes in whole characters) and the
[real LVGL host-rendering harness](tests/display-theme/README.md).
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
  (`--chip esp32` for `attractap_bridge_gl_s10.bin`, with GPIO0 held at power-up)
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

The firmware speaks a line protocol on the USB console (UART0 on the BLE bridge; 115200 8N1):
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

| Topic                     | Payload (besides `authCode`)                                                                          | Reply                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ui.widgets.get`          | —                                                                                                     | `{"screen","width","height","widgets":[...]}`                                                         |
| `ui.widgets.tap`          | `text`, optional `match` (`exact`/`contains`), `index` (default 0), `holdMs` (default 60)             | `{"success":true,"widget":{...}}`                                                                     |
| `ui.touch.tap`            | `x`, `y`, optional `holdMs` (1-60000, default 60)                                                     | `{"success":true}`                                                                                    |
| `ui.touch.press`          | `x`, `y`, optional `holdMs`; without it the finger stays down until `ui.touch.release` (at most 60 s) | `{"success":true}` once pressed or, with `holdMs`, released                                           |
| `ui.touch.release`        | —                                                                                                     | `{"success":true}`                                                                                    |
| `ui.touch.swipe`          | `x1`, `y1`, `x2`, `y2`, optional `durationMs` (1-10000, default 300)                                  | `{"success":true}`                                                                                    |
| `ui.screenshot.get`       | —                                                                                                     | header, data lines and end line (below)                                                               |
| `system.heap.get`         | —                                                                                                     | `{"internalFree","internalLargest","internalMinFree","windowMinFree","windowMinLargest","psramFree"}` |
| `system.heap.reset`       | —                                                                                                     | same as `system.heap.get`, then restarts the `window*` high-water marks                               |
| `ui.touch.controller.get` | — (GT911 displays only)                                                                               | `{"reads","failures"}`: GT911 register reads since boot                                               |

`system.heap.*` report the internal (8-bit capable) heap in bytes.
`internalMinFree` is ESP-IDF's lowest free size since boot. ESP-IDF keeps no
minimum for the largest free block, so a 50 ms sampler task (started by the
first `system.heap.*` command) tracks `windowMinFree` and `windowMinLargest`
since the last `system.heap.reset`; the HIL RAM tests reset the window, run a
workload and compare the window minima with their floors
(`apps/attractap-lab/hil/heap_floors.py`). `ui.touch.controller.get` counts the
GT911 register reads that succeeded and failed: LVGL polls the controller
continuously, so `reads` grows while it answers.

`-DATTRACTAP_VERSION_OVERRIDE=<string>` replaces `version.txt` in a lab build:
the HIL update test builds its second image with it. Release builds never set it.

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

## Crash reports and coredump upload (ATT-474, ATT-1144)

After a panic, watchdog or lockup reset (and after a long-running reader was
power-cycled while hung), the next boot stores a pending crash record in NVS
(`bootdiag/pending`, version 2). It holds the last heap snapshot, the reset
reason, the firmware version that crashed and, when this crash wrote the
coredump in the `coredump` partition (128 KiB), the dump's size and zlib CRC-32.
A dump is attached only to the crash that wrote it: a dump an earlier record
already claimed (`bootdiag/cdclaimed`) or that is finished (`bootdiag/cddone`)
stays out of it. Version 1 and older records follow the same rule when they are
read. A later reset without a dump of its own (a silent hang, or a crash whose
dump write failed) does not replace a record that owns the dump in flash and
has not reported its metadata yet; that reset is only logged. Once the report
exists on the server, the new reset replaces the record and the dump follows as
an orphan, which the server matches to the report awaiting it by size and CRC.

After each sign-in the reader uploads the record, then its dump, from the API
loop with one message in flight. Each 4 KiB chunk is read from flash in 512-byte
pieces (the RGB panel shares the flash bus), so the upload's own buffers take
about 10 KiB whatever the dump size. A chunk goes out only while internal RAM has
room for the chunk, three copies of its ~5.6 KB message (sending on the secure
session copies it about 2.4 times) and 24 KiB headroom, about 44 KiB in all,
with a large enough internal block; otherwise the upload waits, as it does
while an OTA update runs.

| Direction       | Event                      | Payload                                                                                                                                |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Reader → server | `READER_CRASH_REPORT`      | crash metadata, `firmwareVersion` (null if unknown), `coredumpSize`, `coredumpCrc32`                                                   |
| Server → reader | `READER_CRASH_REPORT`      | `received`, `id`, `coredumpUpload: {reportId, chunkSize}` or `coredumpRejected` (`COREDUMP_TOO_LARGE`, `INVALID_COREDUMP`); or `error` |
| Reader → server | `READER_COREDUMP_BEGIN`    | `reportId`, `size`, `crc32`; also after a reconnect or reboot, for the same report                                                     |
| Server → reader | `READER_COREDUMP_BEGIN`    | `reportId`, `chunkSize`, `nextOffset`, or `coredumpStored: true` when an earlier upload was stored, or `error`                         |
| Reader → server | `READER_COREDUMP_CHUNK`    | `reportId`, `offset`, `data` (base64 of at most `chunkSize` bytes)                                                                     |
| Server → reader | `READER_COREDUMP_CHUNK`    | `reportId`, `nextOffset`, or `error` (`COREDUMP_OUT_OF_ORDER` comes with `expectedOffset` to resync)                                   |
| Reader → server | `READER_COREDUMP_COMPLETE` | `reportId`, `totalSize`, `crc32`                                                                                                       |
| Server → reader | `READER_COREDUMP_COMPLETE` | `reportId`, `coredumpStored: true` once the verified dump is stored and symbolicated, or `error`                                       |

The `READER_COREDUMP_*` replies are not acknowledged; the reader retries a
step after 20 s without a reply (120 s for the completion). The record and the
dump stay until the server confirms `coredumpStored`; only then is the dump
erased and the record cleared. A record without a dump is cleared after the
metadata acknowledgement. A disconnect, low heap or a reboot only delays the
upload: it restarts for the same `reportId` after the next sign-in. A failed
attempt is retried after 10 s; after three failures in a row the reader pauses
for 5 minutes and then starts over. A chunk reply that makes no progress (an
acknowledgement that does not move past the chunk, or `COREDUMP_OUT_OF_ORDER`
asking for the chunk just sent) counts as a failure. A metadata reply that
neither offers an upload nor sets `coredumpRejected` counts as a failure too;
only `coredumpRejected` gives the dump up. When the metadata acknowledgement is
lost, the reader sends the metadata again and the server answers with the
report that still awaits the same dump.

A valid dump in flash that no pending record owns (for example one left by
firmware before ATT-1144 after a metadata-only acknowledgement) is uploaded as
a report of its own, with reset reason `UNKNOWN`, no firmware version and
`rebootReason: COREDUMP_ORPHAN`; symbolication reads the build id from the
dump. A dump the server refuses for good is kept in flash for a USB readout
but never offered again (`bootdiag/cddone`); its report shows the dump as
rejected. A metadata `error` reply and a temporary server error on
`READER_COREDUMP_BEGIN` (`CRASH_REPORT_STORE_FAILED`) count as failed attempts:
the record stays and is retried. Firmware before ATT-1144 sent the
dump inline as `coredumpBase64` (32 KiB at most); the server still accepts it.
The secure profile has no coredumps and uploads the record only.

### Crash trigger (lab builds only)

Firmware built with `-DATTRACTAP_CRASH_TRIGGER=ON` accepts
`CMND debug.crash {"stackBytes":<n>}` on the serial console (no PIN): it fills
`n` bytes (at most 64 KiB) of task stacks (16 KiB per task) and panics, so the
coredump grows by about that much. Without `stackBytes` it panics right away. The option is
`OFF` by default, the secure profile refuses it, `build_firmwares.py` passes
`-DATTRACTAP_CRASH_TRIGGER=OFF`, and `tools/check_release_build.py` fails a
release build whose sources were compiled with a lab-only define or whose app
image contains the `debug.crash` topic.

### Device-lab TLS CA (lab builds only)

`-DATTRACTAP_LAB_CA=<ca.pem>` embeds a device-lab CA certificate and puts it
first in the certificate manager's list, so a lab reader validates the lab
API's wss:// certificate (the HIL suite's `HIL_WSS=1` mode, see
`apps/attractap-lab/README.md`). It needs `-DATTRACTAP_TEST_HOOKS=ON` and is
refused for a release secure profile. `build_firmwares.py` passes
`-DATTRACTAP_LAB_CA=`, and `tools/check_release_build.py` fails a release build
compiled with `ATTRACTAP_LAB_CA=1` or whose app image contains the
"Attractap Device Lab CA" list entry.

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
