# Attractap Desktop Simulator

The Attractap desktop simulator is a macOS development tool for exercising the
LVGL display and a persistent virtual NFC card without an ESP32, display, or
physical card. It is not a replacement for an Attractap reader.

> [!WARNING]
> The current desktop target is a local simulator only. It does not yet start
> the production Attractap application, authenticate a reader, or connect to
> an Attraccess API. Do not use it to validate access decisions, enrollment,
> supervision, billing, or resource control.

## Supported Host

The initial target is macOS. It needs:

- CMake 3.24 or later
- A C++20 compiler
- SDL3 discoverable by CMake
- libcurl 8.7 or later
- Network access on the first build when the firmware's vendored LVGL 9.3.0
  source is unavailable; CMake downloads a pinned LVGL source archive

The desktop simulator does not use the ESP-IDF cross-toolchain. Other host
platforms and packaged distributions are not currently supported.

## Build And Launch

From the repository root, build and open the macOS app bundle:

```sh
pnpm nx serve attractap-desktop
```

To build without launching it:

```sh
pnpm nx build attractap-desktop
```

Run the desktop target's tests with:

```sh
pnpm nx test attractap-desktop
```

The simulator opens a 480 x 480 window. Mouse input is delivered as touch
input to LVGL.

## API Setup And Identity

Start a local API separately when developing the broader Attraccess stack:

```sh
pnpm serve --only=api
```

Read the resolved API address from `.dev-serve-ports.json`; do not assume a
fixed port. For example:

```sh
jq -r '.api.url' .dev-serve-ports.json
```

The desktop executable accepts an endpoint and numeric reader ID:

```sh
dist/apps/attractap-desktop/attractap-desktop.app/Contents/MacOS/attractap-desktop \
  https://localhost 0
```

These arguments select and seed a local profile only. The current window does
not use them to connect, register, authenticate, or log into the API. It does
not create a backend reader identity, transmit cards, or generate application
logs. Do not treat the saved endpoint or reader ID as proof of a connection.

The planned transport uses the reader WebSocket endpoint
`ws(s)://<host>:<port>/api/attractap/websocket`, not the Companion protocol.
When it is wired into the application, use a dedicated test reader and an
isolated development database. Keep TLS certificate and hostname validation
enabled, and never put credentials in an endpoint URL.

## Profiles And Reset

Profiles are scoped to the normalized endpoint and reader ID, so separate
endpoints and readers do not share settings or virtual cards. By default, macOS
stores them in:

```
~/Library/Application Support/Attraccess/Attractap/profiles
```

Set `ATTRACTAP_PROFILE_DIR` to use a different root, for example for an
isolated test run:

```sh
ATTRACTAP_PROFILE_DIR="$PWD/.attractap-profiles" pnpm nx serve attractap-desktop
```

Each profile is named `<endpoint-hash>-<reader-id>.profile`. The endpoint hash
is an implementation detail; select the profile by starting the simulator with
the same endpoint and reader ID. Profile directories are created with owner-only
permissions, and profile files are written owner-readable and owner-writable.
They are not encrypted.

To reset a simulator profile, quit the app and delete its matching `.profile`
file from the profile root. There is currently no reset button or command-line
reset flag. This removes the saved endpoint/reader ID values and every virtual
card key stored in that profile. Do not delete a profile while the simulator is
running.

## Virtual Cards

The window models one persistent virtual card. Use the controls to:

- Enter a 4 to 7 byte hexadecimal UID, with optional `:`, `-`, or spaces
- Choose `Unknown`, `NTAG424`, or `DESFire`
- Save the edited card or create a new card with factory keys
- Present or remove the card
- Inspect one of six key slots, set its version, or reset it to the factory key
- Inject authentication failures and key-write failures

Card state, key versions, and injected faults are saved in the selected
profile. Keys cannot be entered in the UI. A future production-workflow
integration must write the server-issued key through the virtual NFC adapter;
it must not automatically make a card authenticate successfully.

## Safety And Simulation Limits

Use only dedicated development identities, test cards, resources, and a
disposable database for connected-simulator work. A local visual output does
not make future backend actions harmless: session, door, or flow actions can
affect real equipment; card reset can delete real card records; and top-up can
activate a payment terminal. Never use production card UIDs, resources, or
payment integrations in automated scenarios.

The current local simulator does not access physical NFC hardware, GPIO,
beepers, LEDs, relays, firmware storage, OTA, watchdog recovery, or crash
upload. It cannot perform reader authentication, backend authorization,
enrollment, reset, supervision, sessions, or physical actuation.

Even after API integration is added, this tool will validate UI and
client/server integration only. It does not validate RF or APDU behavior,
PN532/I2C timing, physical panel or touch behavior, DMA, ESP32 memory limits,
FreeRTOS races, embedded networking, or OTA correctness. Test those on real
hardware before deployment.
