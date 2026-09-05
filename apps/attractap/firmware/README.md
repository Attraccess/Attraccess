# Attractap Firmware

Firmware for the Attractap NFC readers (ESP32-S3), built on **ESP-IDF v6.0.2** (`idf.py` + CMake — no Arduino, no PlatformIO).

## Variants

One firmware per hardware flavor, defined by a file in `variants/`:

| Variant | Board | Hardware |
| --- | --- | --- |
| `attractap-touch` | ESP32-S3 DevKitC (V3 hardware) | ST7701 480x480 RGB panel, GT911 touch, TCA9554 IO expander, PN532 NFC, WiFi |
| `attractap-touch-v2` | ESP32-S3 DevKitC (V4 hardware) | as above, 16-bit PCA9555-compatible expander @0x24, PN532 @0x64 |
| `attractap-touch-ethernet` | Adafruit Qualia S3 RGB666 | TL040WVS03 panel via XCA9554 expander, FocalTech touch, W5500 ethernet |
| `attractap-lite-ethernet` | Adafruit Qualia S3 | headless, WS2812 24-LED ring, W5500 ethernet |

Each variant file sets the compile definitions (pins, feature flags, firmware
name) and the source subtrees excluded for that hardware. The firmware version
lives in `version.txt` — bump it whenever firmware source changes (CI enforces
this).

## Building

Prerequisites: [ESP-IDF v6.0.2](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/get-started/index.html) installed for the `esp32s3` target. Install the project-local toolchain at `.tools/esp-idf` with `INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh`. No extra Python packages are needed — `esptool` is picked up from your `PATH` or from ESP-IDF's own Python environment, and `cmake`/`ninja` are installed into the IDF tool set automatically if your system lacks them.

NixOS note: Espressif's prebuilt binaries (xtensa toolchain, cmake, ninja) are dynamically linked against FHS paths, so they need `programs.nix-ld.enable = true;` (or an FHS environment like `steam-run`) to execute.

Build every shipped variant (also what CI and `pnpm nx run attractap-firmware:build` run):

```bash
python3 build_firmwares.py
```

This generates the CA-certificate headers (`src/certs/`), builds each variant
into `build/<variant>/`, and writes `firmware_output/` containing per variant:

- `<name>_<variant>.bin` — merged image for the web serial flasher (flash at offset `0x0`)
- `<name>_<variant>_ota.bin` — app-only image for OTA updates via the server
- `<name>_<variant>.elf` — unstripped ELF for server-side coredump symbolication
- `firmwares.json` — manifest consumed by the Attraccess API/frontend

Build directories are retained so CMake and Ninja can reuse unchanged work on
the next build. Pass `--clean` to discard that state, for example after a
toolchain upgrade:

```bash
python3 build_firmwares.py --clean
```

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

## Flashing

- **Web flasher (initial install):** the Attraccess frontend flashes the merged
  `.bin` over Web Serial (Chrome/Edge). The device console runs on the ESP32-S3
  USB-Serial-JTAG port.
- **CLI:** `python -m esptool --chip esp32s3 write_flash 0x0 firmware_output/<name>_<variant>.bin`
- **OTA:** upload `firmware_output` via the Attraccess server; updates stream to
  the readers over the websocket.

## Serial provisioning console

The firmware speaks a line protocol on the USB console (115200 8N1):
`CMND <topic> <json>` in, `RESP <topic> <json>` out — used by the frontend's
hardware setup flow. Log lines have the format `[Module] LEVEL: message`.

## Attractap Lite LED Animations

The Attractap Lite variant uses a WS2812 LED ring for status feedback. For a user-facing guide to LED states and triggers, see the [Attractap Lite LED Guide](../../../docs/user/resources/iots/attractap-lite-led-guide.md) in the docs.

### LED States (for developers)

| State | Color | Circular Animation | When used |
|-------|-------|--------------------|-----------|
| `LED_STATE_CONFIG_REQUIRED` | Red / Orange | 3 dots alternating red ↔ orange every 12 phases | Device needs configuration |
| `LED_STATE_INIT` | Blue | 8-LED fading tail moving around ring | Booting / connecting |
| `LED_STATE_WAIT_FOR_CARD` | Green | 6 segments breathing in/out of phase | Ready for card tap |
| `LED_STATE_AUTHENTICATE_CARD` | Cyan | 6-LED fading tail at double speed | Card being read |
| `LED_STATE_NO_RESOURCES` | Orange | Full-ring on/off flash every 10 phases | No resources assigned |
| `LED_STATE_FIRMWARE_UPDATE` | Blue / White | Static alternating blue/white pixels | Firmware update in progress |

### LED Triggers

| Trigger | Color | When used |
|---------|-------|-----------|
| `triggerSuccess()` | Green | Auth succeeded |
| `triggerError()` | Red flash | Auth failed |
| `triggerIndicate()` | Yellow flash | Card held too long |
