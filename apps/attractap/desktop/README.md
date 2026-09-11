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
