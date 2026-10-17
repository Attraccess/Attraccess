# Attractap desktop simulator

The native SDL app runs the production LVGL screens inside the device's CAD
render. It requires SDL **3.4 or newer** (for PNG loading), CMake 3.24+, and
libcurl 8.7+ with WebSocket support. On macOS, the build prefers Homebrew curl.

## Download for macOS

Nightly CI produces separate Apple Silicon (`arm64`) and Intel (`x86_64`) DMGs in
the **Build Attractap Desktop for macOS** artifacts of the main-branch nightly
run. Each published GitHub Release also has the two DMGs as release assets.
The CI downloads target macOS 15 or newer and bundle their libraries, so
Homebrew and a source checkout are not needed on the user's Mac.

Open the DMG, drag **Attractap Simulator.app** to Applications, then open it.
Enter the Attraccess server URL in the launch dialog. For the imec demo,
use `https://detlef.apps.attraccess.org`. The dialog pre-fills that address on
later launches. Since the current CI has no Apple Developer ID signing or
notarization credentials, macOS may block the first launch. After trying to
open it, go to **System Settings → Privacy & Security → Open Anyway** and
confirm. The app includes the same steps in `START HERE.txt` on the DMG.

To produce a DMG locally on macOS after building:

```sh
apps/attractap/desktop/package-macos.sh
```

```sh
pnpm nx build attractap-desktop
open -n dist/apps/attractap-desktop/attractap-desktop.app
pnpm nx test attractap-desktop
```

The automated tests use SDL's dummy audio driver, so card scans and error
patterns stay silent even when an agent runs tests in the background. The
interactive simulator still plays its normal beeps. When running test binaries
directly, set `SDL_AUDIO_DRIVER=dummy` as in the capture commands below.

`pnpm nx serve attractap-desktop` builds and launches a fresh app process. Quit
the previous simulator before restarting it. On macOS, `open` without `-n`
only activates an already-running instance, even after its executable has been
rebuilt, so it can keep displaying an older version of the UI.

To bypass the launch dialog and choose an API endpoint and reader profile,
launch the executable directly:

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
screens. They cover resource selection into the lockscreen with an umlaut in
the resource name, scaled touches, card hold/release, cancellation, clearing
data, and resized-window hit testing. To also capture preview images,
pass an existing output directory:

```sh
SDL_AUDIO_DRIVER=dummy SDL_VIDEODRIVER=dummy SDL_RENDER_DRIVER=software \
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
registration, a nondefault device PIN loaded after restart without a launch-time
write, card enrollment and authentication after restart, unknown and
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

For reader operation, see the user guide in
[English](../../../docs/en/attractap/using-the-reader.md) or
[German](../../../docs/de/attractap/using-the-reader.md).

## Reader workflow checks

`pnpm nx test attractap-desktop` also runs the reader workflows against a
deterministic server transport. These cover sign-in, resource actions, forms,
supervision and recovery. The timeout test uses a real clock and takes about
134 seconds. The tests exercise the application, API parser, NFC verifier and
screen router; physical NFC, touch hardware and live-network behavior still
need a device smoke test.

To save packed RGBA8 framebuffers for conversion to PNG, pass an output path:

```sh
SDL_AUDIO_DRIVER=dummy \
  dist/apps/attractap-desktop/attractap-reader-workflow-tests /tmp/reader-flow
apps/attractap/firmware/tests/display-theme/build/display-theme-host --output /tmp/reader-states
```

The user guide's screenshots are native display captures. The deterministic reader tests use a simulated transport. The connected desktop
simulator uses the real host connection for its network badge.
