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

---

## Upload

```bash
pio run -e attractap-p4 -t upload
```

Device is usually `/dev/ttyACM0` (USB-Serial-JTAG).

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
| `FRAMEWORK_DIR` / `Path(...) returns NoneType` | The project applies `tools/patch_pioarduino_framework_dir.py` automatically. If it fails, manually patch `~/.platformio/platforms/espressif32/builder/frameworks/arduino.py`: when `FRAMEWORK_DIR` is None, use `FRAMEWORK_LIB_DIR/chip_variant/pioarduino-build.py` (see the script for the exact patch). |
| `cc1plus` or `riscv32-esp-elf-g++: not found` | Run `pio pkg update` or remove `~/.platformio/packages/toolchain-riscv32-esp*` and rebuild |
| `ModuleNotFoundError: No module named 'intelhex'` | esptool needs intelhex for bootloader conversion. If PlatformIO was installed via pipx: `~/.local/share/pipx/venvs/platformio/bin/python -m pip install intelhex`. Otherwise: `~/.platformio/penv/bin/pip install intelhex` |
| `ModuleNotFoundError: esptool` | `~/.platformio/penv/bin/pip install --force-reinstall esptool` |

---

## References

- P4 findings (hardware/config): `attractap-p4-findings.md`
- P4 handoff/verification: `docs/P4_HANDOFF.md`
- Merge plan: `docs/P4_MERGE_PLAN.md`
