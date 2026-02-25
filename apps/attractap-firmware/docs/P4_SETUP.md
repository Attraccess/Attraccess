# ESP32-P4 Setup Guide (Guition JC1060P470)

This guide covers building, uploading, and debugging Attractap firmware on the **Guition JC1060P470** 7" 1024×600 DSI touchscreen (ESP32-P4 + C6 coprocessor).

---

## Hardware

### Pinout (Guition JC1060P470)

| Function        | Pin  |
|-----------------|------|
| I2C SDA         | 7    |
| I2C SCL         | 8    |
| Touch reset     | 22   |
| Touch interrupt | 21   |
| Display reset   | 5    |
| Backlight       | 23   |

### ESP-Hosted (P4↔C6 WiFi Transport)

WiFi is provided by the on-board ESP32-C6 coprocessor via ESP-Hosted. The transport is **SDIO 4-bit**:

| Signal   | GPIO |
|----------|------|
| CMD      | 19   |
| CLK      | 18   |
| D0       | 14   |
| D1       | 15   |
| D2       | 16   |
| D3       | 17   |
| C6 Reset | 54   |

The firmware calls `esp_hosted_init()` and `esp_hosted_connect_to_slave()` before WiFi init. The C6 must run ESP-Hosted slave firmware (typically pre-flashed on Guition boards).

### Working Configuration

| Parameter        | Value |
|------------------|-------|
| Display reset    | GPIO05 |
| Backlight        | GPIO23, PWM, **active-high** |
| HSYNC pulse      | 20 |
| DSI lane rate    | 750 Mbps |
| Prefer speed     | 48 MHz |

Build flag: `P4_LCD_BL_ACTIVE_HIGH=1`

---

## Build

```bash
cd apps/attractap-firmware
pio run -e attractap-p4
```

**Note:** The P4 build requires `esp_hosted` and `esp_wifi_remote` in `src/idf_component.yml` (target `esp32p4`). If the build fails with missing `esp_hosted.h`, add:

```yaml
  espressif/esp_wifi_remote:
    version: "*"
    rules:
      - if: 'target == "esp32p4"'
  espressif/esp_hosted:
    version: "*"
    rules:
      - if: 'target == "esp32p4"'
```

---

## Upload

```bash
pio run -e attractap-p4 -t upload
```

Device is usually `/dev/ttyACM0` (USB-Serial-JTAG).

**Important:** Use PlatformIO upload, not manual esptool. For ESP32-P4 the bootloader goes at 0x2000 (not 0x0). Manual `esptool write_flash 0x0 bootloader.bin ...` causes boot failure (invalid header / watchdog loop).

---

## WiFi (ESP-Hosted)

Attractap initializes ESP-Hosted before WiFi:

1. `esp_hosted_init()` – initializes the SDIO transport between P4 and C6
2. `esp_hosted_connect_to_slave()` – connects to the C6 coprocessor
3. `Wifi::setup()` – standard ESP-IDF WiFi init (uses C6 via RPC)

If WiFi scan shows no networks or "Transport not initialized":

- Ensure the C6 is running ESP-Hosted slave firmware (Guition boards usually ship with this)
- Check serial for "ESP-Hosted transport ready" – if missing, transport init failed
- Verify SDIO pins (19, 18, 14–17, 54) are not used by other peripherals

---

## Serial

- **ARDUINO_USB_MODE=1** – Uses USB-Serial-JTAG for serial output (configured in `platformio.ini`).
- Add your user to the `dialout` group for serial access:
  ```bash
  sudo usermod -a -G dialout $USER
  ```
  Log out and back in for the change to take effect.

---

## Toolchain Troubleshooting

| Issue | Fix |
|-------|-----|
| `cc1plus` or `riscv32-esp-elf-g++: not found` | Run `pio pkg update` or remove `~/.platformio/packages/toolchain-riscv32-esp*` and rebuild |
| `ModuleNotFoundError: No module named 'intelhex'` | esptool needs intelhex for bootloader conversion. If PlatformIO was installed via pipx: `~/.local/share/pipx/venvs/platformio/bin/python -m pip install intelhex`. Otherwise: `~/.platformio/penv/bin/pip install intelhex` |
| `ModuleNotFoundError: esptool` | `~/.platformio/penv/bin/pip install --force-reinstall esptool` |

---

## References

- P4 findings (hardware/config): `attractap-p4-findings.md`
- P4 handoff/verification: `docs/P4_HANDOFF.md`
- Merge plan: `docs/P4_MERGE_PLAN.md`
- ESP-Hosted-MCU: https://github.com/espressif/esp-hosted-mcu
