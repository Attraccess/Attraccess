# Attractap NFC Reader

Attractap is an ESP32-based NFC card reader that provides physical access control for your makerspace. It reads NFC cards, checks user permissions with the Attraccess backend, and controls access to machines and doors.

## What is Attractap?

Attractap is a compact hardware device that you mount next to a machine or door. When a user holds their NFC card to the reader, it:

1. Reads the card's unique ID
2. Sends the ID to the Attraccess backend via WebSocket
3. Receives an access decision (granted or denied)
4. Shows the result on the built-in display
5. Plays a sound via the buzzer (success or error tone)

<!-- TODO: Screenshot of an Attractap reader mounted next to a machine -->

## Key Features

| Feature | Description |
|---------|-------------|
| **NFC Card Reading** | Reads standard NFC cards (MIFARE, NTAG, etc.) via PN532 reader |
| **Real-Time Communication** | Connects to Attraccess backend via WebSocket for instant access decisions |
| **Display** | Shows status messages on built-in e-ink or LCD display |
| **Audio Feedback** | Buzzer provides audible confirmation of access granted or denied |
| **OTA Updates** | Firmware can be updated over the network without physical access |
| **Multiple Variants** | Available with touch display or basic display, WiFi or Ethernet |

## How It Works

Attractap acts as a bridge between physical NFC cards and the Attraccess software. The reader maintains a persistent WebSocket connection to your Attraccess server. When a card is scanned, the backend checks whether the card is linked to a user account and whether that user has permission to use the assigned resource.

> [!NOTE]
> Attractap requires a running Attraccess backend server. The reader cannot function as a standalone device.

## Hardware Variants

Multiple hardware configurations are available to suit different environments:

- **Attractap Lite Ethernet** -- Basic reader with wired Ethernet connection
- **Attractap Touch WiFi** -- Reader with touch display and wireless connection
- **Attractap Touch Ethernet** -- Reader with touch display and wired connection

See [Hardware](attractap/hardware.md) for detailed specifications of each variant.

> [!TIP]
> For most setups, the **Touch WiFi** variant offers the best balance of features and easy installation -- no network cable required.

## See Also

- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [Setup](attractap/setup.md) -- Register and configure readers
- [NFC Cards](attractap/nfc-cards.md) -- Manage user NFC cards
- [Firmware Updates](attractap/firmware-updates.md) -- Update reader firmware
- [Resources](resources/overview.md) -- Manage machines and doors
