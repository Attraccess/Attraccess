# Firmware Display Theme Host Harness

Headless **real LVGL 9.3.0** software rendering at 480 x 480. This compiles the
production `DisplayTheme` and screen `.cpp` files directly. There is no SDL,
browser rendering, copied screen implementation, ESP-IDF build, or device access.

## Run

Requirements: CMake 3.24+, a C/C++20 compiler and an assembler supporting `.incbin`
(Apple Clang or Linux GCC/Clang). The first configure needs network access unless
an existing LVGL source tree is supplied.

From the repository root:

```sh
cmake -S apps/attractap/firmware/tests/display-theme \
  -B apps/attractap/firmware/tests/display-theme/build \
  -DCMAKE_BUILD_TYPE=Debug
cmake --build apps/attractap/firmware/tests/display-theme/build --parallel 2
ctest --test-dir apps/attractap/firmware/tests/display-theme/build --output-on-failure
apps/attractap/firmware/tests/display-theme/build/display-theme-host \
  --output apps/attractap/firmware/tests/display-theme/output
```

The harness runs all checks and renders all fixtures even without `--output`.
Exit codes: `0` passes, `1` test/LVGL failure, `2` usage or harness setup failure.
Assertions are independent of `NDEBUG`. Each test group and rendered fixture is
named in stdout; failures include the failed expectation on stderr. CTest also
runs the executable in two fresh processes and compares the SHA-256 hashes of
every RGBA artifact, checking the exact file size.
Repeatability is independent of correctness: a reproducible rendering regression
can pass the repeatability test while `display-theme-host` still fails CTest.

LVGL source selection is explicit `LVGL_SOURCE_DIR`, then
`firmware/managed_components/lvgl__lvgl` if available at configure time, otherwise
FetchContent pinned to the v9.3.0 commit
`108e5aff3c90cc4d969331ed61aff2bbd365d430`. The source tree is never modified;
dependency sources and all object files stay in the host build directory.
Other LVGL versions fail a compile-time assertion.

To use the production-managed source explicitly, add this configure argument:

```sh
-DLVGL_SOURCE_DIR="$PWD/apps/attractap/firmware/managed_components/lvgl__lvgl"
```

Any other existing 9.3.0 source directory can be supplied by absolute path. Use
a separate `build-*` directory to compare builds against different sources.
No production build configuration, CMake, version, image header, asset or
dependency interface is changed by this harness. Existing firmware compiler
warnings may also appear in a host build.

## Coverage

| Area | Verified |
| --- | --- |
| Theme | Already-created and new screens, surfaces, inherited 18px font/text, white background, radius, no gradients/shadows |
| Buttons | Automatic theme and primary/secondary/danger helpers; default, pressed, disabled, disabled + pressed, keyboard focus; inherited label text, border, color-filter removal, visible focus outline; framebuffer fill samples |
| Fields | Textarea and dropdown focus/disabled styles; helper field, placeholder, cursor, selection background/text |
| Keyboard | Real LVGL keyboard and button matrix, automatic and helper styles, pressed/checked/disabled item styles; real per-key controls and framebuffer fill samples |
| Logos | Both production descriptors and embedded RGB565+A8 files, word alignment, byte counts, no recolor, every fully opaque/transparent pixel against the rendered framebuffer |
| Boot | Production title and deterministic firmware info |
| Init | Pending network, connected WLAN/certificate search warning, authenticated API state, settings event callback |
| NFC Enrollment / Reset | Waiting, writing, success, error; cached username; phase colors; cancel visibility/callback; deterministic countdown and expiry |
| Supervision | Waiting, verifying, success, error; public `View` fixture; hint; cancel visibility and time-based cancel guard |
| PIN | Production field/numeric keyboard, real keyboard value-change callbacks entering `1234`, valid/rejected/short PIN and cancel behavior, per-key state rendering |

Production `IScreen::init()` idempotence and normal screen teardown are exercised.
There are **11 test groups and 25 rendered fixtures**. The reported check count
includes individual logo pixels, not just behavioral assertions. Widget gallery
frames are labeled `widgets-*`; they exercise the production theme but are not
claimed to be firmware screens. All other screen fixtures use production layouts.

Not covered: physical touch input or NFC, RTOS scheduling, memory pressure on the
ESP32, display panel/DMA/byte swapping, networking or TLS, the display router,
drawers/overlays/popups, other screens, every input string/layout edge case, or
pixel-golden design approval. Nonblank frame checks and repeatability are smoke
tests, not proof that every label is unclipped. This does not replace the full
firmware build or on-device validation.

Framebuffer fill checks intentionally compare the rendered RGB565 pixels to the
theme's explicit state colors. In LVGL 9.3 the default theme's `recolor` and
`recolor_opa` can still tint pressed/disabled states even when the background
style getter is correct and the legacy `color_filter_dsc` is null. Such a
rendering mismatch must fail rather than be hidden by a style-only assertion.

## Determinism And Shims

`fixtures.hpp` holds reusable fake names, PIN and real `State` value types.
Each test group starts the firmware clock at 1,000 ms, with empty network/API
state. Only explicit test steps move that clock. Enrollment/reset/supervision
start with a 30-second deadline. Init uses reserved example host/IP values.
Boot uses `Attractap Host vtest`, independent of the real version file.

LVGL's separate virtual tick advances in exactly 20 x 16 ms steps to settle
transitions before style reads and captures. No sleeps or wall clock are used.
Spinner/cursor animation phases therefore repeat for the same fixture sequence.
The production `PIN_ETH_SPI_CS=1` branch is used for init-screen visibility.

`lv_conf.h` includes `../../include/lv_conf.h`, preserving firmware draw features,
fonts and RGB565 color depth, then overrides OS to `LV_OS_NONE`, software draw
units to one, malloc to the C library, monitors off, and default font to
Montserrat 18. LVGL error logs fail the run.

The shims provide only SDK header declarations, a deterministic
`esp_timer_get_time()`, the logger constructor, and the three `State` getters
consumed by init. The actual production `platform.hpp`, `state.hpp`, `utils.hpp`
and `logger.hpp` are used. Non-error logging levels are compiled out. Other
logger/SDK operations fail to link instead of silently pretending that hardware
works.

Production `src/display/images/logos.S.in` is a handwritten assembly template
which embeds the existing raw assets with `.incbin`, explicitly aligns their
RGB565 data, and exports their exact `_binary_*_start`/`_end` symbols.
It supports Apple's and Linux's sections without requiring an ESP-IDF install.
The generated `.S`, fetched LVGL, binaries and local render output are gitignored.
Do not commit generated source; selected renders published for visual review
belong in documentation assets, not in this test output directory.

## Artifacts

Each `.rgba` file is **921,600 bytes**: 480 pixels wide x 480 pixels high x 4
bytes. Pixels are row-major, top to bottom, left to right, with **R, G, B, A**
byte order, no header and no row padding. Alpha is always 255. The pixels come
from the real RGB565 framebuffer, expanded to RGB8 by bit replication, so they
retain the firmware's 16-bit color quantization. The stdout FNV-1a hashes are
diagnostics, not stored golden baselines.

Files: `widgets-surfaces`, `widgets-buttons`, `widgets-button-helpers`,
`widgets-inputs`, `production-logos`, `boot`, `init-pending`, `init-cert-search`,
`init-connected`, `enrollment-{waiting,writing,success,error}`,
`reset-{waiting,writing,success,error}`,
`supervision-{waiting,verifying,success,error}`,
`pin-{empty,valid,key-states,rejected}` (all with `.rgba` suffix).

Sharp can convert one using these input options (run where Sharp is installed):

```js
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const file = 'apps/attractap/firmware/tests/display-theme/output/boot.rgba';
await sharp(await readFile(file), {
  raw: { width: 480, height: 480, channels: 4 },
}).png().toFile(file.replace(/\.rgba$/, '.png'));
```

Or use an existing FFmpeg installation:

```sh
ffmpeg -f rawvideo -pixel_format rgba -video_size 480x480 \
  -i apps/attractap/firmware/tests/display-theme/output/boot.rgba \
  -frames:v 1 -update 1 apps/attractap/firmware/tests/display-theme/output/boot.png
```
