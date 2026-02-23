# Attractap Firmware

This directory contains the firmware for the Attractap device, an ESP32-C3 based RFID/NFC reader.

## Web Installation

You can install the firmware directly from your web browser using [ESP Web Tools](https://esphome.github.io/esp-web-tools/), which allows for a seamless installation experience without requiring command-line tools.

### Requirements

- Chrome or Edge browser on desktop (Web Serial is not supported on mobile or Firefox)
- ESP32-C3 based Attractap device
- USB connection to your computer

### Quick Installation

1. Connect your Attractap device to your computer via USB
2. Visit our [firmware installation page](https://OWNER_NAME.github.io/Attraccess/) (replace OWNER_NAME with your GitHub username)
3. Click the "Install" button and follow the on-screen instructions
4. If prompted, select the correct serial port for your device
5. Wait for the installation to complete

### Manual Installation

If the web installer doesn't work for you, you can download the firmware binary from the GitHub Pages site and flash it manually:

```bash
# Install esptool
pip install esptool

# Flash the firmware
esptool.py --chip esp32c3 --port /dev/ttyUSB0 --baud 921600 write_flash 0x0 merged-firmware.bin
```

Replace `/dev/ttyUSB0` with the correct port for your device:

- On Windows, this will be a COM port (e.g., COM3)
- On macOS, this will be something like `/dev/tty.usbserial-X`
- On Linux, it's typically `/dev/ttyUSB0` or `/dev/ttyACM0`

## Development Setup

1. Install [PlatformIO](https://platformio.org/)
2. Clone this repository
3. Open the `apps/attractap-firmware` directory in PlatformIO
4. Build and upload the firmware

## Development

### Project Structure

- `src/`: Contains the source code for the firmware
- `include/`: Header files
- `lib/`: Libraries
- `platformio.ini`: PlatformIO configuration file

### Building

To build the firmware, run:

```bash
pio run -e attractap
```

### Uploading During Development

To upload the firmware to a connected device, run:

```bash
pio run -e attractap -t upload
```

## Continuous Integration

This project uses GitHub Actions for continuous integration:

1. When changes are pushed to the `main` branch that affect files in the `apps/attractap-firmware` directory, a build is triggered
2. The firmware is built using PlatformIO, creating a merged binary for ESP Web Tools
3. The files are automatically deployed to GitHub Pages with a web installer interface
4. The firmware can be installed using any browser that supports Web Serial API

### How ESP Web Tools Integration Works

The GitHub Actions workflow:

1. Builds the firmware using PlatformIO
2. Creates a merged binary file compatible with ESP Web Tools
3. Generates a manifest.json file with absolute URLs to the firmware
4. Deploys these files to GitHub Pages
5. Creates a web interface with the ESP Web Tools install button

The manifest.json file contains the necessary information for ESP Web Tools to install the firmware, including the URL to the firmware binary and the chip family (ESP32-C3).

## Attractap Lite LED Animations

The Attractap Lite variant uses a WS2812 LED ring for status feedback. For a user-facing guide to LED states and triggers, see the [Attractap Lite LED Guide](../../docs/user/resources/iots/attractap-lite-led-guide.md) in the docs.

### LED States (for developers)

| State | Color | When used |
|-------|-------|-----------|
| `LED_STATE_CONFIG_REQUIRED` | Orange | Device needs configuration |
| `LED_STATE_INIT` | Blue | Booting / connecting |
| `LED_STATE_WAIT_FOR_CARD` | Green | Ready for card tap |
| `LED_STATE_AUTHENTICATE_CARD` | Cyan | Card being read |
| `LED_STATE_NO_RESOURCES` | Orange | No resources assigned |
| `LED_STATE_FIRMWARE_UPDATE` | Rainbow | Firmware update in progress |

### LED Triggers

| Trigger | Color | When used |
|---------|-------|-----------|
| `triggerSuccess()` | Green | Auth succeeded |
| `triggerError()` | Red flash | Auth failed |
| `triggerIndicate()` | Yellow flash | Card held too long |

## License

[Specify your license here]
