# Attractap Setup
<!-- llms-description: Guide to connect a new Attractap reader to your network, pair it with Attraccess and assign resources to it. -->

This guide walks you through pairing a new Attractap reader in Attraccess and assigning it to a resource.

## Prerequisites

Before you begin, make sure:

- Your Attraccess server is running and accessible
- The Attractap reader is powered on and can reach your server over the network (Wi-Fi or Ethernet)
- You have administrator permissions in Attraccess

## Step 1: Give the Reader Its PIN, Network and Server

A new reader (freshly flashed, or reset) needs a PIN, its network and the address of your Attraccess server. There are three ways to set them:

- **Over USB** with the web flasher: open **Devices** > **Attractap Readers**, choose **Set up Attractap** and click **Connect via USB**. It installs the firmware and then configures the PIN, Wi-Fi and server (Serial Configurator).
- **On the reader itself** (Attractap Touch): a reader without a server address shows its settings on the screen. Enter the Wi-Fi network, the server and a PIN there.
- **Over Bluetooth**, without a cable (firmware 2.8.0 or later): see below.

Ethernet variants (Attractap Lite) take their address from DHCP as soon as the cable is plugged in; they only need the PIN and the server.

### Set up over Bluetooth

A reader that is **not paired yet** opens its Bluetooth setup by itself:

| Reader | How the setup opens | What it shows |
|--------|---------------------|---------------|
| **Attractap Touch** (and Touch V2) | For 10 minutes after every start. Later, press **Bluetooth setup** next to **Settings** on the connecting screen for another 10 minutes. | A line on the screen: "Bluetooth setup open · 09:41 · Attractap Touch 71C8", and "Bluetooth setup: browser connected" while your browser is connected. |
| **Attractap Lite** | For 10 minutes after every power-up. Unplug and plug in again for another 10 minutes. | The LED ring pulses blue twice every 1.5 seconds; it stays blue while your browser is connected. See the [LED Guide](attractap/led-guide.md). |
| **BLE Bridge** | Hold its button for 3 seconds. | See [BLE Bridge](attractap/ble-bridge.md). |

1. In Attraccess, open **Devices** > **Attractap Readers**, choose **Set up Attractap** and click **Set up over Bluetooth**.
2. Pick the reader in the browser's list. Its name is "Attractap Touch", "Attractap Lite" or "Attractap Bridge" followed by four characters; a Touch shows its name on the screen. Confirm the pairing prompt of your computer or phone if one appears.
3. Set the PIN, then the Wi-Fi network (not on the Lite) and the server. The Firmware tab is not offered over Bluetooth: firmware is installed over USB or updated over the network.
4. Continue with step 2: the reader asks to be paired.

The setup closes after 10 minutes, about 10 seconds after the reader is paired (your browser then shows **Setup complete**), or when the reader restarts. A paired reader never opens it and shows no **Bluetooth setup** button. The connection is encrypted (Bluetooth LE Secure Connections), so the Wi-Fi password is never sent in clear text, and the same PIN rules apply as over USB. See [Reader Security](attractap/reader-security.md#setup-over-bluetooth).

| Browser | Bluetooth setup |
|---------|-----------------|
| Chrome or Edge on Windows, macOS, Linux | Supported |
| Chrome on Android | Supported |
| Firefox, Safari, any browser on iOS | Not supported: use USB with Chrome or Edge on a computer |

> [!NOTE]
> The page must be opened over HTTPS (or `localhost`); browsers only offer Bluetooth to secure pages. While the setup is open, plugins cannot use the reader's Bluetooth yet; they get it once the setup has closed.

## Step 2: Pair the Reader with Attraccess

A reader cannot register itself. It shows a rotating code and an admin approves it once.

1. Make sure the reader knows your server address. A reader without credentials then goes straight
   to pairing and shows a code (Touch: on the screen and as a QR code; Lite: as a colour pattern
   on the LED ring and in the web flasher).
2. Scan the QR code with your phone, or open the readers page in Attraccess (**Devices** >
   **Attractap Readers**), click **Pair** on the waiting reader in the **Not paired** list and enter
   the code.
3. Optionally enter a name (for example "Laser Cutter Reader") and click **Approve**.

The reader connects and is ready. See [Reader Pairing](attractap/pairing.md) for details, the Lite
LED pattern, security notes and what to do after the upgrade to firmware 2.6.0, when every reader pairs again.

> [!NOTE]
> You need the `resources.update` permission to approve a reader. A reader that signs in with a token
> (any firmware older than 1.8.0, and a reader on 1.8.0 to 2.5.x that was never paired) cannot pair and
> cannot update over the air; flash it to firmware 2.6.0 with the web flasher (USB) first.

## Step 3: Assign Resources to the Reader

After pairing the reader, you need to assign which resource(s) it controls:

1. Open the reader you just paired (it opens automatically; later use **Edit** on its row)
2. Open the **Resources** tab
3. Select the resource (machine or door) that this reader should control
4. Click **Save Changes**

> [!TIP]
> A single reader can be assigned to one resource. If you need to control multiple machines, set up a separate reader for each one.

<!-- TODO: Screenshot of assigning a resource to a reader -->

### Optional: Allow plugins to use Bluetooth

On the **General** tab of the reader editor, the switch **Allow plugins to use Bluetooth** is off by default. When this is on, plugins with the `BLE_TRANSPORT` permission can scan for nearby Bluetooth devices of the kinds they support and connect to the devices they have set up. Turning it off immediately ends their Bluetooth connections through this reader. Plugins can only use the Bluetooth profiles they registered themselves; see [Bluetooth Transport for Plugins](plugins/ble-transport.md).

Plugin Bluetooth needs a paired reader (step 2) running firmware **2.5.0 or later**. Update older readers over the air (OTA) from the server; see [Firmware Updates](attractap/firmware-updates.md). On older firmware the switch has no effect and plugins get `READER_UNSUPPORTED`; on a reader that is not paired they get `READER_OFFLINE`. A reader runs one Bluetooth connection at a time: while one plugin uses it, other plugins are refused with `READER_BUSY` and try again later. Card login and the rest of the reader keep working during Bluetooth use.

## Step 4: Test the Setup

1. Hold a registered RFID card to the reader
2. The reader should communicate with the backend and show an access decision on its display
3. If the card is linked to a user with permission for the assigned resource, access is granted

## Connection Details

The reader communicates with the Attraccess backend via WebSocket. The connection is established automatically when the reader starts up.

| Detail | Description |
|--------|-------------|
| **Protocol** | WebSocket (WS/WSS) |
| **Connection** | Persistent, auto-reconnect on disconnection |
| **Authentication** | Mutually authenticated TLS 1.3 inside the WebSocket, using the key and certificate issued when the reader was paired |

> [!NOTE]
> If your Attraccess server uses HTTPS, the reader will connect via secure WebSocket (WSS). Make sure your SSL certificate is valid.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Reader display shows "No connection" | Check network connectivity and verify the Attraccess server URL |
| Reader not appearing in Attraccess | Ensure the reader is on the same network and can reach the backend. A reverse proxy must pass the `Sec-WebSocket-Protocol` header |
| Code is rejected | The code changes every 30 seconds; enter the one currently shown. If a correctly read code keeps failing, check your network |
| Reader list is empty after a server update | The release that removes token sign-in (Attractap firmware 2.6.0) deletes every reader record. Pair each reader again, see [After the upgrade](attractap/pairing.md#after-the-upgrade-every-reader-pairs-again) |
| Card scan has no response | Verify the RFID card is registered and the reader has an assigned resource |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Reader Pairing](attractap/pairing.md) -- Approve readers, security and operations
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [RFID Cards](attractap/rfid-cards.md) -- Register and manage RFID cards
- [Resources](resources/overview.md) -- Manage machines and doors
