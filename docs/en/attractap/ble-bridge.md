# Attractap BLE Bridge

<!-- llms-description: Sets up the Attractap BLE Bridge on a GL.iNet GL-S10, a headless reader that only relays Bluetooth Low Energy for plugins such as door locks. -->

The Attractap BLE Bridge is a headless Attractap without NFC, display or card features. It only relays Bluetooth Low Energy (BLE) for plugins, for example plugins for Bluetooth door locks. Use a bridge where no Attractap reader is close enough to the lock.

Attraccess treats the bridge as a reader with the Bluetooth capability. Plugins use it like any other reader through `context.ble`; see [Bluetooth Transport for Plugins](plugins/ble-transport.md). A bridge can never be assigned to a resource, because it cannot read cards.

## Supported Hardware

The bridge runs on the **GL.iNet GL-S10** BLE gateway.

| Detail      | Description                                  |
| ----------- | -------------------------------------------- |
| **Chip**    | Classic ESP32 (Bluetooth 4.2 LE), 4 MB flash |
| **Network** | Ethernet with PoE, Wi-Fi                     |
| **v1.x**    | LAN8720 Ethernet PHY                         |
| **v2.x**    | IP101 Ethernet PHY                           |

> [!NOTE]
> On the v2.x hardware, Ethernet can show packet loss. This is a known issue in ESP-IDF. If you see it, use a v1.x unit or Wi-Fi.

## Flashing the GL-S10

You open the case only for the first flash. All later updates go over the network.

The micro-USB port of the S10 only supplies power; there is no USB-serial chip. To flash it, you need a **3.3 V USB-TTL adapter**:

1. Open the case.
2. Connect the adapter to the serial pads: TX to RX, RX to TX (crossed), GND to GND and 3.3 V to 3.3 V.
3. Hold the download button (**GPIO0**) while you power up the S10. It starts in download mode.

> [!WARNING]
> **Never power the S10 through USB and PoE at the same time.** Disconnect the Ethernet cable while the adapter is connected.
>
> **Never use a 5 V adapter on the logic pins.** 5 V damages the ESP32. Check that your adapter is set to 3.3 V before you connect it.

### Back up the stock firmware

Before the first flash, save the stock GL.iNet firmware:

```bash
esptool.py --chip esp32 --port <port> read_flash 0 0x400000 gl-s10-stock.bin
```

Keep the file private. You can restore the stock firmware later with `esptool.py --chip esp32 --port <port> write_flash 0 gl-s10-stock.bin`.

### Flash the bridge firmware

1. In Attraccess, open the readers page (**Devices** > **Attractap Readers**) and choose **Hardware Setup** > **Setup RFID-Reader**.
2. Choose the firmware **Attractap BLE Bridge — GL.iNet GL-S10** and read the warning.
3. Click **Connect** and pick the serial port of your adapter. The browser cannot reset the chip, so the S10 must already be in download mode.
4. Flash the firmware. Attraccess refuses to flash if the connected chip is not the expected one.
5. Power-cycle the S10 **without** holding GPIO0. It now starts the bridge firmware.
6. The page continues into the configuration on the same port. Set the PIN, the Wi-Fi network (optional) and the API URL of your Attraccess server.

> [!NOTE]
> There is no known way to install the bridge over the network from the stock GL.iNet firmware. You need the serial adapter for the first flash.

## Setup and Pairing

The bridge pairs like any other reader: it waits with a code, and an admin approves it once. See [Reader Pairing](attractap/pairing.md).

In the reader list, the bridge appears as **Bluetooth bridge**. The switch **Allow plugins to use Bluetooth** is already on. This default applies once: if an admin turns it off, it stays off. The bridge settings have no resources, NFC, display or LED options.

## Ethernet and Wi-Fi

Ethernet (with PoE) is the preferred connection.

- If Ethernet has no link or no IP address for 30 seconds and Wi-Fi credentials are configured, the bridge switches to Wi-Fi.
- As soon as Ethernet has a link and an IP address again, the bridge switches back to Ethernet.

> [!TIP]
> Prefer Ethernet. On the classic ESP32, Wi-Fi and Bluetooth share one radio, so Bluetooth throughput and range are lower while the bridge uses Wi-Fi.

## LEDs

The three LEDs are on the front of the S10.

| LED         | State      | Meaning                                        |
| ----------- | ---------- | ---------------------------------------------- |
| **Power**   | On         | The firmware is running                        |
| **Network** | On         | Connected to Attraccess                        |
| **Network** | Slow blink | Network is up, but not connected to Attraccess |
| **Network** | Fast blink | No network                                     |
| **BT**      | On         | A plugin has an open Bluetooth connection      |
| **BT**      | Blinking   | A scan or advertisement watch is active        |
| **BT**      | Off        | Idle                                           |

## Button

The button is the reset button on the case, not GPIO0.

| Action                  | Result                                                               |
| ----------------------- | -------------------------------------------------------------------- |
| **Short press**         | The bridge restarts                                                  |
| **Hold for 10 seconds** | Factory reset: clears Wi-Fi, the API URL and the pairing credentials |

After 2 seconds all three LEDs blink fast. Release the button before 10 seconds to cancel. At 10 seconds the factory reset runs: all LEDs light up and the bridge restarts unconfigured.

> [!WARNING]
> After a factory reset, the bridge must be set up again over the serial port, which means opening the case again. It also has to be paired again.

## Mounting and Bluetooth Range

- Mount the bridge within a few metres of the lock, with line of sight where possible.
- Keep it away from metal enclosures.
- Check the signal strength (RSSI) in the plugin after mounting.
- A bridge holds **one Bluetooth connection at a time**. While one plugin uses it, other plugins are refused with `READER_BUSY` and try again later.

## Firmware Updates

All later firmware updates go over the network (OTA), like for other readers. You never open the case again. See [Firmware Updates](attractap/firmware-updates.md).

## Security

The bridge runs **without** the Attractap secure profile: no Secure Boot, no flash encryption, and its eFuses are not burned.

- If your installation relies on the secure profile for readers (see [Reader Security](attractap/reader-security.md)), note that bridges do not have it.
- Anyone with physical access to a bridge can read its flash, including its pairing credentials. Mount bridges where they cannot easily be taken. If a bridge is lost, remove its pairing in Attraccess.

Secure Boot for the bridge is planned. It needs ESP32 chip revision v3.0 or later.

## See Also

- [Bluetooth Transport for Plugins](plugins/ble-transport.md) -- How plugins use readers and bridges for Bluetooth
- [Reader Pairing](attractap/pairing.md) -- Approve readers, security and operations
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [Firmware Updates](attractap/firmware-updates.md) -- Update reader firmware
