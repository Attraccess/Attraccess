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

## Step 2: Approve the reader in Attraccess

1. Update unregistered readers to firmware 1.7.0 or later supporting enrollment codes. Existing registered readers reconnect with their saved credentials.
2. Connect the reader to your local Attraccess URL. Its screen shows a cryptographically random `XXX-XXX` code and QR code. Displayless variants print the code on their local serial console; it is not written to remote logs.
3. Sign in with `resources.update`, open **Devices → Attractap Readers → Add reader** and enter the current code or scan it with your camera.
4. Check that the code belongs to the intended reader and click **Approve**. Scanning fills the form; it never opens a URL or approves automatically.
5. The reader receives and saves its credentials only after approval. Open the resulting reader to rename it and configure resources.

The code changes every 30 seconds. If it expires, disconnects, collides with another code or an approval is already running, use the current code and retry. Camera access needs a secure browser context; manual entry remains available. Reader and companion QR codes are type-specific and cannot be interchanged.

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

1. Hold a registered RFID card to the reader
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
| Card scan has no response | Verify the RFID card is registered and the reader has an assigned resource |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [RFID Cards](attractap/rfid-cards.md) -- Register and manage RFID cards
- [Resources](resources/overview.md) -- Manage machines and doors


## Enrollment limits and recovery

Pending enrollment exists only in the server process owning the live socket. Restarting the server discards it; reconnect and use a fresh code. Multiple replicas require routing approval to that same process; shared enrollment across replicas is not supported. No device row, token or device authority exists before approval. A failed or uncertain credential delivery cannot replay credentials; remove any approved but unreachable registration and enroll again with a fresh code.

| Limit | Value |
|-------|-------|
| Pending sockets | 128 total, 8 per peer IP |
| Initial announcement / absolute connection lifetime | 10 seconds / 5 minutes |
| Code validity / announcements | 30 seconds / 3 per socket per 30 seconds |
| Pending frame / metadata | 4 KiB (including fragmented frames) / 1 KiB |
| Connection attempts per minute | 10 per peer IP, 100 total |
| Approval attempts per minute | 5 per account, 20 per IP, 100 total |
| Counter capacity | 10,000 entries; new entries rejected when full |

Devices behind a proxy share its peer-IP connection limits. Native devices need no Origin header; a browser-supplied Origin must be explicitly allowed. Enrollment and valid-device reconnect use the local server without external Internet access. The QR format is `attraccess-enroll:v1:reader:ABC-123`; never publish a current code in a screenshot or log from a real deployment.
