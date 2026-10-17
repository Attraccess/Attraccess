# Attractap desktop simulator

The native SDL app runs the production LVGL screens inside the device's CAD
render. It requires SDL **3.4 or newer** (for PNG loading), CMake 3.24+, and
libcurl 8.7+ with WebSocket support. On macOS, the build prefers Homebrew curl.

```sh
pnpm nx build attractap-desktop
open dist/apps/attractap-desktop/attractap-desktop.app
pnpm nx test attractap-desktop
```

To choose an API endpoint and reader profile, launch the executable directly:

```sh
dist/apps/attractap-desktop/attractap-desktop.app/Contents/MacOS/attractap-desktop https://your-server.example 42
```

## Using the device

- Click the display to interact with the firmware. The 480 × 480 LVGL image and
  touch coordinates scale together when resizing the window.
- Click the **NFC pad** to open the four-card menu below the display.
- **Press and hold** a card to present it. It stays present while held, including
  when the pointer moves off the card, and is removed on release. Leaving the
  window, losing focus, closing the menu, or quitting also removes it.
- Close the menu with **X**, **Escape**, or a click outside it. The display remains
  visible during card presentation.
- **Clear stored data** resets the last selected card after a second confirming
  click. Closing the menu or selecting another card cancels confirmation.

The CAD image is embedded in the executable, including the macOS app bundle.

## Display interaction checks

The display tests use SDL's headless software renderer and the production LVGL
startup screen. They cover scaled touches, card hold/release, cancellation,
clearing data, and resized-window hit testing. To also capture preview images,
pass an existing output directory:

```sh
SDL_VIDEODRIVER=dummy SDL_RENDER_DRIVER=software \
  dist/apps/attractap-desktop/attractap-desktop-display-tests /path/to/screenshots
```

## Isolated real-API workflows

```sh
pnpm nx run attractap-desktop:test-real-api
```

This opt-in target builds the native probe, starts the existing Nest API on a
free loopback port, and drives the production application, protocol and LVGL
callbacks through numbered JSON files. It uses SDL's dummy video driver and
software renderer; no desktop window or embedded toolchain is needed. Install
the normal workspace dependencies (`scripts/setup-dev-dependencies.sh`) and the
native prerequisites above. The first CMake build downloads pinned LVGL and
ArduinoJson sources. Ordinary API unit and E2E targets exclude this suite.

Each invocation creates its own SQLite database, storage, empty plugin folder,
control directory and reader profiles. The dedicated Jest setup ignores `.env`
and inherited application settings, uses a random session secret and disables
plugins. Real migrations, authentication and permissions remain enabled.
Prerequisite users, resources, introductions, projects and forms are seeded only
in that disposable database. Successful enrollment, usage and approval are
performed through the real application workflows.

The scenarios check exact reader registration, acknowledged resource delivery
before and after a newly authenticated connection, profile reuse without duplicate
registration, card enrollment and authentication after restart, unknown and
incorrect card keys, failed writes, removal during a write and recovery. They also
check project sessions, required start/end forms, missing input, a real server
validation rejection followed by correction, and a web request that waits for an
eligible supervisor's card. Probe validation and controlled failure scenarios
check malformed commands, unsafe screenshot names, bounded waits and cleanup.

Screenshots come from the actual 480 × 480 display framebuffer, separately from
the desktop shell captures used by component tests. PNG signatures and dimensions
are checked. Artifacts remain under
`dist/apps/attractap-desktop/real-api-artifacts/<scenario>-<unique-id>/`, including
revision metadata, observed screen labels, per-connection delivery results and
filtered launch diagnostics. They are local generated
artifacts; do not commit them. Inspect workflow frames when reviewing changes;
PNG creation alone does not establish visual correctness. Concurrent invocations
retain separate artifacts and disposable data. Native builds share the normal
build directory, so run this target serially.

The fixture waits for owned processes to exit before deleting their temporary
profiles and controls. Nest and SQLite close before storage is removed. Tests may
explicitly restart a reader with its own profile to check persistence. Build and
probe waits are bounded. If startup fails, inspect the error and retained launch
log. A moved worktree may need a fresh CMake build directory: preserve any desired
artifacts, then rename `dist/apps/attractap-desktop` before rerunning. If a screen
action fails, its error includes observed labels; ambiguous, hidden or disabled
widgets are rejected. The probe has no production control listener.

These host workflows do not establish physical RF/card compatibility, device
hardware timing, embedded memory limits, FreeRTOS scheduling or OTA correctness.
The desktop network badge follows the actual host connection; it does not
measure the embedded transport's ping quality.
