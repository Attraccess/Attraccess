# Attractap Hardware

Attractap readers are available in several hardware variants. This page describes the different configurations, their components, and connectivity options.

## Hardware Variants

| Variant | Display | Connectivity | Best For |
|---------|---------|-------------|----------|
| **Attractap Lite Ethernet** | Basic LCD | Wired Ethernet | Stationary setups with existing network cabling |
| **Attractap Touch WiFi** | Touch LCD | WiFi | Flexible placement without network cables |
| **Attractap Touch Ethernet** | Touch LCD | Wired Ethernet | Reliable connection with touch interface |

> [!TIP]
> Choose an Ethernet variant when you need maximum reliability. Choose WiFi when running a network cable to the mounting location is impractical.

## Core Components

Every Attractap reader contains the following components:

| Component | Description |
|-----------|-------------|
| **ESP32 MCU** | Microcontroller that runs the Attractap firmware and manages all peripherals |
| **PN532 NFC Reader** | Reads NFC cards (MIFARE Classic, MIFARE Ultralight, NTAG series) |
| **Display** | Shows status information, user feedback, and access decisions. LCD or touch LCD depending on variant |
| **Buzzer** | Provides audio feedback -- short beep for access granted, error tone for denied |

<!-- TODO: Screenshot of Attractap hardware with labeled components -->

## Connectivity

### WiFi

WiFi variants connect to your local wireless network. During initial setup, the reader creates a temporary access point for configuration.

| Setting | Description |
|---------|-------------|
| **SSID** | Your WiFi network name |
| **Password** | Your WiFi password |
| **Channel** | Auto-detected |
| **Security** | WPA2 recommended |

### Ethernet

Ethernet variants connect via a standard RJ45 cable. DHCP is used by default for automatic network configuration.

| Setting | Description |
|---------|-------------|
| **IP Address** | Assigned via DHCP (default) or static |
| **Gateway** | Auto-detected via DHCP |
| **DNS** | Auto-detected via DHCP |

> [!NOTE]
> Ethernet variants require Power over Ethernet (PoE) or a separate USB power supply, depending on your hardware revision.

## Firmware Updates

All variants support OTA (Over-The-Air) firmware updates. Updates are managed through the Attraccess backend and pushed to the reader devices over the network.

See [Firmware Updates](attractap/firmware-updates.md) for details on managing firmware.

## Mounting

Attractap readers are designed to be mounted next to a machine or door. Consider the following when choosing a mounting location:

- The NFC reader area must be accessible to users
- The display should be easily readable
- WiFi variants need adequate wireless signal at the mounting location
- Ethernet variants need access to a network port

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Setup](attractap/setup.md) -- Register and configure readers
- [Firmware Updates](attractap/firmware-updates.md) -- Update reader firmware
