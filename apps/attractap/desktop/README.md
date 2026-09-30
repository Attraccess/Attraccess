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
SDL_VIDEODRIVER=dummy SDL_RENDER_DRIVER=software \
  dist/apps/attractap-desktop/attractap-desktop-display-tests /path/to/screenshots
```

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
dist/apps/attractap-desktop/attractap-reader-workflow-tests /tmp/reader-flow
apps/attractap/firmware/tests/display-theme/build/display-theme-host --output /tmp/reader-states
```

The user guide's screenshots are native display captures. The desktop transport
and network badge use demonstration data.
