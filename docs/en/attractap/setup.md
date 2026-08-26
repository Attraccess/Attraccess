# Attractap Setup

This guide walks you through registering a new Attractap reader in Attraccess and assigning it to a resource.

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

## Step 2: Register the Reader in Attraccess

1. Open Attraccess in your browser
2. Open the **Devices** group in the sidebar
3. Click on **Attractap Readers**
4. Click **Add Reader**
5. Enter the reader details:

| Field | Description |
|-------|-------------|
| **Name** | A descriptive name (e.g. "Laser Cutter Reader") |
| **Description** | Optional description of the reader's location or purpose |

6. Click **Save**

<!-- TODO: Screenshot of the Add Reader dialog -->

## Step 3: Assign Resources to the Reader

After registering the reader, you need to assign which resource(s) it controls:

1. Open the reader you just created
2. In the **Resources** section, click **Add Resource**
3. Select the resource (machine or door) that this reader should control
4. Click **Save**

> [!TIP]
> A single reader can be assigned to one resource. If you need to control multiple machines, set up a separate reader for each one.

<!-- TODO: Screenshot of assigning a resource to a reader -->

## Step 4: Test the Setup

1. Hold a registered NFC card to the reader
2. The reader should communicate with the backend and show an access decision on its display
3. If the card is linked to a user with permission for the assigned resource, access is granted

## Connection Details

The reader communicates with the Attraccess backend via WebSocket. The connection is established automatically when the reader starts up.

| Detail | Description |
|--------|-------------|
| **Protocol** | WebSocket (WS/WSS) |
| **Connection** | Persistent, auto-reconnect on disconnection |
| **Authentication** | Reader authenticates with the backend using its registered credentials |

> [!NOTE]
> If your Attraccess server uses HTTPS, the reader will connect via secure WebSocket (WSS). Make sure your SSL certificate is valid.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Reader display shows "No connection" | Check network connectivity and verify the Attraccess server URL |
| Reader not appearing in Attraccess | Ensure the reader is on the same network and can reach the backend |
| Card scan has no response | Verify the NFC card is registered and the reader has an assigned resource |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [NFC Cards](attractap/nfc-cards.md) -- Register and manage NFC cards
- [Resources](resources/overview.md) -- Manage machines and doors
