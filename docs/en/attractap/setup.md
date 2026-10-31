# Attractap Setup

This guide walks you through pairing a new Attractap reader in Attraccess and assigning it to a resource.

## Prerequisites

Before you begin, make sure:

- Your Attraccess server is running and accessible
- The Attractap reader is powered on and connected to the same network as your server
- You have administrator permissions in Attraccess

## Step 1: Connect the Reader to Your Network

### WiFi Variant

1. Power on the Attractap reader
2. The reader creates a temporary WiFi access point (e.g. `Attractap-Setup`)
3. Connect to this access point from your phone or laptop
4. Enter your WiFi network name (SSID) and password
5. The reader restarts and connects to your network

### Ethernet Variant

1. Connect the Attractap reader to your network via an Ethernet cable
2. Power on the reader
3. The reader automatically obtains an IP address via DHCP

> [!NOTE]
> The reader's display shows its connection status and IP address once connected.

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
LED pattern, security notes and what to do with readers that were registered before.

> [!NOTE]
> You need the `resources.update` permission to approve a reader. Readers running firmware older
> than 1.8.0 cannot pair a new reader; update them with the web flasher first.

## Step 3: Assign Resources to the Reader

After pairing the reader, you need to assign which resource(s) it controls:

1. Open the reader you just paired (it opens automatically; later use **Edit** on its row)
2. Open the **Resources** tab
3. Select the resource (machine or door) that this reader should control
4. Click **Save Changes**

> [!TIP]
> A single reader can be assigned to one resource. If you need to control multiple machines, set up a separate reader for each one.

<!-- TODO: Screenshot of assigning a resource to a reader -->

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
| Settings of a reader are locked | The reader is not paired yet; use **Pair** on its row |
| Card scan has no response | Verify the RFID card is registered and the reader has an assigned resource |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Reader Pairing](attractap/pairing.md) -- Approve readers, security and operations
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [RFID Cards](attractap/rfid-cards.md) -- Register and manage RFID cards
- [Resources](resources/overview.md) -- Manage machines and doors
