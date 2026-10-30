# Reader Pairing and Encrypted Connection

A new Attractap reader joins your installation through **one approval by an admin**. The reader
shows a short code that changes every 30 seconds (Touch readers on the screen and as a QR code,
Lite readers as a colour pattern on the LED ring). An admin confirms that code in Attraccess. That
single step creates the reader, trusts its key, gives it a certificate and makes it remember your
installation's certificate authority.

Afterwards the reader talks to the server through a mutually authenticated, encrypted TLS 1.3
session that runs inside the normal WebSocket. Plain `ws://` works, `wss://` is optional, and the
reader always checks that it is talking to _your_ server. Readers can no longer register
themselves: nobody can add a reader without an admin approving it.

## Reader states

| State               | Meaning                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Waiting**         | A new reader shows its code and waits for an admin. It appears in the **Pending readers** list while it is waiting.                                   |
| **Not paired**      | A reader registered with a token before this version. It keeps working with its token until an admin pairs it from its row. Its settings stay locked. |
| **Paired**          | The reader has its own key and certificate and can be used and set up.                                                                                |
| **Pairing removed** | An admin removed the pairing. The reader disconnects within a second, shows "Pairing removed" and waits for approval again with a new key.            |

Only paired readers are listed in the **Active** and **Stale** tables and can be edited.

## Pairing a new reader

You need the `resources.update` permission (shown as **Update Resources** in the role editor).
Pairing takes effect immediately; you do not need to save the reader afterwards.

1. Connect the reader to your network and enter your server address (see [Setup](attractap/setup.md)).
   A reader without credentials goes straight to pairing and shows its code.
2. Read the code from the reader:
   - **Touch readers** show the code (for example `K7P-3XQ`) with a countdown and a QR code.
     **Scan the QR code** with your phone: it opens Attraccess with the code filled in
     (`<your address>/?enroll=K7P3XQ`). Sign in if asked and approve. The QR code is only shown
     when the server knows its public address; otherwise type the code.
   - **Lite readers** have no screen. The LED ring shows a colour pattern and the **web
     flasher** shows the code (see below).
3. In Attraccess, open the readers page, choose to pair a reader, and enter the code, or just
   follow the QR link. The page shows which reader the code belongs to (type and firmware).
   Optionally give it a name and approve it.
4. The reader shows a short green result, restarts its connection into the encrypted session and
   is ready. Its settings open so you can assign resources.

Codes use the letters and digits `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, so `0`, `O`, `1`, `I` and `L`
never occur. A code changes every 30 seconds; the previous code stays valid until the next change,
so a code you just read still works. A pending request lasts 10 minutes; then the reader asks again
with a new code and keeps its key. If two readers happen to show the same code at the same time,
Attraccess asks you to wait for the next code.

You can also approve from the list of waiting readers: pick the reader and enter the code it shows.
Touch readers always need the code: it proves that you are looking at that very reader.

### Lite readers: LED pattern

A Lite reader shows the pattern on its ring of 24 LEDs, split into **8 segments of 3 LEDs**:

- The **start segment blinks**; read the segments **clockwise** from there.
- Each segment shows one of six colours: red, green, blue, yellow, white (full brightness, not
  breathing) or magenta.
- A slowly **breathing white** ring means the reader has no pattern yet (it is connecting or
  waiting for the first code). This is not a code.
- After approval the ring flashes **green** for success or **red** if pairing failed.

Compare the eight colours with the colour list the approval page shows for the waiting Lite reader
and approve. The pattern changes with the code every 30 seconds. See the
[LED guide](attractap/led-guide.md).

Lite readers also derive the normal code. Open the web flasher, connect the reader and press
**Approve** next to the shown code, or read the line `Enrollment: code=XXX-XXX` on the serial
console.

## Pairing a reader that already exists

Readers that registered with a token before this version keep working with that token until they
are paired. Their row in the readers list has a **Pair** button. Click it and the connected reader
starts pairing and shows a code. Approve the code as above. The pairing is bound to the existing
record, so name, machines and settings stay. If the reader is not connected, **Pair** cannot reach
it; switch it on first. Settings of a reader that is not paired stay locked.

After pairing, a reader never falls back to its token or to an unencrypted channel, and it never
deletes its stored certificate authority or key because of a message that is not authenticated.
If the TLS connection to the pinned server fails, the reader shows an error and retries; it does
not enrol again by itself.

## Remove pairing, pair again

These actions are in the **Pairing** tab of a paired reader's settings.

- **Pair again**: use it after the reader was reset, or when you swap in a different reader (for
  example after a defect). The new reader shows its code, you approve it for the existing record.
  Name, machines and settings stay; the old pairing stops working right away.
- **Remove pairing**: asks for confirmation, then disconnects the reader within a second. It shows
  "Pairing removed", creates a **new key** and waits for approval again. It never uses its old
  sign-in.

The **History** in the Pairing tab lists every pairing, replacement and removal with the user who
did it and when. It is kept even after the reader is deleted.

## Security

### Plain HTTP

If the admin page is opened over plain HTTP (not HTTPS and not localhost), the pairing page
shows a warning: someone who controls the network could show you fake information, including a
fake reader that is not yours. Use HTTPS or a network you trust. Pairing is not blocked.

### What an attacker can and cannot do

The code is derived from both sides' keys and random values, so approving it ties your decision to
exactly the reader and server that computed it. A Touch reader checks your server against a
commitment it received before the code was computed. An attacker who is **actively in the network
during the enrollment** can make a reader trust the attacker instead of your server, but cannot make
it trust your server in a way you would approve: the code the reader shows then differs from the
code the server computes, so your approval fails ("code not found"). If a code that you read
correctly is rejected, stop and check the network before trying again.

Attempts are limited: three per minute per connection, ten per ten minutes and twenty waiting
requests per address, 200 waiting requests in total, and five wrong codes per admin per minute.
For the per-address limits to work behind a reverse proxy, set `TRUST_PROXY` (see below).

## Operations

### Backup

The installation identity (a certificate authority for readers and the server certificate) is
stored in the database. The CA private key and the server key are stored **encrypted** with a key
derived from `AUTH_SESSION_SECRET`; the certificates themselves are not secret.
**Back up the database and `AUTH_SESSION_SECRET` together.** If the secret is lost or changed, the
keys cannot be decrypted and every reader has to be paired again.

### Reverse proxies

The reader selects its transport with the WebSocket subprotocols `attractap-session.v1`
(encrypted session) and `attractap-pairing.v1` (pairing). A reverse proxy must pass the
`Sec-WebSocket-Protocol` header in both directions. If it strips the header, paired readers cannot
connect and show a clear error; they never fall back to an unencrypted connection.

The server refuses unknown `attractap-*` subprotocol versions (for example `attractap-session.v2`)
with HTTP 400 during the WebSocket upgrade.

Set [`TRUST_PROXY`](installation/environment-variables.md) so that the pairing limits per address
see the real address of the reader and not the proxy's. Without it, all readers behind the proxy
share one limit.

### One server instance

Attraccess keeps pending pairings and limits in memory. Run **a single API instance**. There is no
coordination between several instances, so with more than one instance a reader and an admin may
reach different instances and approval fails.

### Certificate authority rotation

The certificate authority is created once per installation. Rotating it is **not implemented**;
there is no button or command for it. The server certificate renews itself.

### Older firmware

| Reader firmware             | Behaviour with this server                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.7.x and older, registered | Keeps working with its token and is updated over the air automatically. Afterwards it must be paired from its row (**Pair**). Its settings stay locked until then. |
| 1.7.x and older, new        | Cannot enrol. It sends the old registration request and gets **no reply**; it waits. Update it with the web flasher first.                                         |
| 1.8.0 and newer             | Pairs with the flow on this page.                                                                                                                                  |

### Metrics

`attraccess_attractap_sessions_active`, `attraccess_attractap_handshake_queue_depth` and
`attraccess_attractap_handshake_failures_total{reason}`.
