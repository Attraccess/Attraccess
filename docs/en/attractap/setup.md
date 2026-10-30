# Attractap Setup

This guide walks you through approving a new Attractap reader in Attraccess and assigning it to a resource.

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

## Step 2: Approve the Reader in Attraccess

A new reader does not register itself. Once it is connected to your network it shows a **code** such as `K7P-3XQ` and waits. The reader only exists in Attraccess after an administrator approves that code, so nobody can add devices to your system just by plugging them in.

1. Wait until the reader shows **Approve this reader in Attraccess** and a code. The code changes every 30 seconds and the countdown on the display tells you when.
2. Open Attraccess in your browser and open **Attractap > Readers**.
3. Click **Enroll device**.
4. Type the code. Upper and lower case and the hyphen do not matter.
5. Optionally enter a name for the reader.
6. Click **Approve**. Attraccess opens the new reader so you can finish its setup.

The reader receives its credentials and connects. It keeps them across restarts, so you only approve a reader once.

You need the permission to update resources (`resources.update`) to approve a reader. Other ways to open the dialog:

- Open `<your Attraccess address>/?enroll=K7P-3XQ`. The dialog opens with the code filled in.
- Click **Scan with camera** in the dialog and scan a QR code that links to such an address. The camera button only appears when Attraccess is opened over HTTPS (or on `localhost`), because browsers block camera access otherwise. Typing the code always works.

### Readers without a display (Attractap Lite)

A Lite reader has no screen, so it shows a **colour pattern** on its LED ring instead of a code: four steady colour segments with one dark LED between them. The pattern changes every 30 seconds.

1. Open **Attractap > Readers**. The **Waiting Lite readers** card lists every Lite reader that waits for approval, with the four colours of its pattern (the colour names are written next to the swatches), the time until the pattern changes, its firmware and how long it has been waiting.
2. Hold the list next to the reader in front of you and find the entry whose colours match the ring. The ring may be turned, so start at any segment and read around the ring in either direction.
3. Click **Approve**, check the pattern against the ring once more, optionally enter a name and confirm.

The ring flashes green and the reader continues starting up. Only approve a reader you can see: anyone on your network can make a device claim to be a Lite reader, the pattern is what tells you that the device in front of you is the one in the list.

If more readers wait than there are free patterns, the ring breathes white and the reader does not appear in the list. Approve it with the web flasher (**Setup RFID-Reader**) instead: after the serial setup it shows **Waiting for approval** with the current code and an **Approve** button. The code is also available on the reader's USB serial console (`api.status.get`, field `enrollmentCode`). Lite firmware older than 1.8.1 always has to be approved this way.

### Limits and wrong codes

- A code is only valid while it is shown, plus the 30 seconds after it was replaced.
- A waiting reader that is not approved within 10 minutes disconnects and shows a new code when it reconnects.
- After 5 wrong codes within a minute Attraccess answers **Too many attempts**. Wait a minute and try again.
- Pending requests are kept in memory only. A restart of Attraccess forgets them and waiting readers simply show a new code.

> [!IMPORTANT]
> **Behind a reverse proxy, set `TRUST_PROXY`.** Attraccess limits how many enrollment requests a single network address can make (10 attempts per 10 minutes and 20 waiting readers at the same time). Without `TRUST_PROXY` every reader appears to come from the proxy and shares one limit. See [Security](settings/security.md#reverse-proxies-and-the-real-client-ip).

> [!NOTE]
> **Several Attraccess servers:** pending requests live on the server that holds the reader's connection. Approve the reader on that same server (for example by opening it directly or by pinning your load balancer), otherwise the code is reported as unknown.

> [!WARNING]
> **Older reader firmware cannot enroll.** Firmware before version 1.8.0 asks for credentials without a code. Attraccess ignores such requests and no reader is created. Such a reader just waits. Update it over USB with the web flasher first. Readers that are already registered keep working unchanged.

## Step 3: Assign Resources to the Reader

After approving the reader, you need to assign which resource(s) it controls:

1. Open the reader you just approved
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
| Reader not appearing in Attraccess | Ensure the reader is on the same network and can reach the backend, then approve the code it shows under **Attractap > Readers > Enroll device** |
| Reader shows a code but Attraccess says the code is unknown | The code changed (every 30 s), you are on another Attraccess server than the reader, or the reader's firmware is older than 1.8.0 |
| "Too many attempts" | More than 5 wrong codes in a minute. Wait a minute |
| Card scan has no response | Verify the RFID card is registered and the reader has an assigned resource |

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Hardware](attractap/hardware.md) -- Hardware variants and components
- [RFID Cards](attractap/rfid-cards.md) -- Register and manage RFID cards
- [Resources](resources/overview.md) -- Manage machines and doors
