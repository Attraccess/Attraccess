# Reader Pairing and Encrypted Connection
<!-- llms-description: How a reader joins an installation with one admin approval, reader states, re-pairing and the encrypted connection. -->

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

| State               | Meaning                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Waiting**         | A new reader shows its code and waits for an admin. It appears as a **New reader** row in the **Not paired** list while it is waiting.                                                  |
| **Paired**          | The reader has its own key and certificate and can be used and set up.                                                                                                                  |
| **Pairing removed** | An admin removed the pairing. The reader disconnects within a second, shows "Pairing removed" and waits for approval again with a new key. Its record stays in the **Not paired** list. |

Only paired readers are listed in the **Active Attractaps** and **Stale Attractaps** tables and can be edited.

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
3. In Attraccess, open the readers page (**Devices** > **Attractap Readers**). The waiting reader
   appears in the **Not paired** list as **New reader**. Click **Pair**, enter the code, optionally
   give the reader a name and click **Approve**. Or just follow the QR link: it opens the same
   dialog with the code filled in and shows which reader it belongs to (type and firmware).
4. The reader shows a short green result, restarts its connection into the encrypted session and
   is ready. Its settings open so you can assign resources.

Codes use the letters and digits `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, so `0`, `O`, `1`, `I` and `L`
never occur. A code changes every 30 seconds; the previous code stays valid until the next change,
so a code you just read still works. A pending request lasts 10 minutes; then the reader asks again
with a new code and keeps its key. That is not an error: the reader shows no failure and only waits
a moment for its next code. If two readers happen to show the same code at the same time,
Attraccess asks you to wait for the next code.

You can also approve from the **Not paired** list: click **Pair** on the reader's row and enter the code it shows.
Touch readers always need the code: it proves that you are looking at that very reader.

### Lite readers: LED pattern

A Lite reader shows the pattern on its ring of 24 LEDs, split into **8 segments of 3 LEDs**:

- The **start segment blinks**; read the segments **clockwise** from there.
- Each segment shows one of six colours: red, green, blue, yellow, white (full brightness, not
  breathing) or magenta.
- A slowly **breathing white** ring means the reader has no pattern yet (it has asked for pairing
  and waits for the first code, lost its connection, or its request just expired after
  10 minutes). This is not a code.
- After approval the ring flashes **green** for success or **red** if pairing failed. A request
  that simply expired does not flash red.

Compare the eight colours with the colour list the approval page shows for the waiting Lite reader
and approve. The pattern changes with the code every 30 seconds. See the
[LED guide](attractap/led-guide.md).

Lite readers also derive the normal code. Open the web flasher, connect the reader and press
**Approve** next to the shown code, or read the line `Enrollment: code=XXX-XXX` on the serial
console.

## After the upgrade: every reader pairs again

Readers no longer sign in with a token. The server version that introduces this removes every reader
record when it starts for the first time: the reader list is empty afterwards, and the server behaves as if
it had never known a reader. This also applies to readers that were already paired. **Every reader has
to be paired again** with the steps above; resources, names and per-reader settings have to be set up
again, and the card writer setting no longer names any reader. Cards, users and resources are not touched.

A reader on firmware 2.6.0 or newer with no certificate goes straight to pairing and shows its code. A
reader that was already paired over the encrypted connection (firmware 1.8.0 to 2.5.x) keeps its key, but
the server no longer knows it. At its next connection the server tells it that its pairing is no longer
valid, and it shows its code again.

**Readers on firmware older than 2.6.0 that only know a token update over the air first.** Old firmware
cannot pair, so the server lets such a reader connect for one thing only: it signs it in without checking
the token (there are no reader records left to check it against), offers the latest firmware for its
variant and sends it. Nothing else works on that connection: no machines, no cards, no reader record. The
reader shows the name "Firmware update" meanwhile. After the update it starts the new firmware and pairs like
a new reader. The server logs `Updating an old reader with token sign-in` for each one. If it logs
`has no newer image for it` instead, it has no firmware for that reader's variant: flash that reader over
USB with the web flasher. At most 50 old readers update at the same time; the others connect again
later.

If the server cannot prove it is your installation, a Touch reader shows **Server could not be
verified** on its connecting screen and tries again every 30 seconds; a Lite reader flashes
**red** on every failed attempt. It does not enrol again by itself, and it never deletes its stored
certificate authority or key because of a message that is not authenticated.

## Remove pairing, pair again

These actions are in the **Pairing** tab of a paired reader's settings.

- **Pair again**: use it after the reader was reset, or when you swap in a different reader (for
  example after a defect). The new reader shows its code, you approve it for the existing record.
  Name, machines and settings stay; the old pairing stops working right away.
- **Remove pairing**: asks for confirmation, then disconnects the reader within a second. It shows
  "Pairing removed", creates a **new key** and waits for approval again. Afterwards the reader appears
  in the **Not paired** list; click **Pair** to pair it again.

The **History** in the Pairing tab lists every pairing, replacement and removal with the user who
did it and when. It is kept even after the reader is deleted.

## Security

### Plain HTTP

If the admin page is opened over plain HTTP (not HTTPS and not localhost), the pairing page
shows a warning: someone who controls the network could show you fake information, including a
fake reader that is not yours. Use HTTPS or a network you trust. Pairing is not blocked.

### Secure readers

A reader that runs a secure build of the firmware (Secure Boot and flash encryption) sends the server
a report of its security settings each time it connects. The server compares the report with the secure
profile and shows **Secured** or **Not secured**, with the settings that do not match, in the **Pairing**
tab of the reader. Only a release build of a regular variant, connected with its paired key, can become
secured; a lab build (development mode), a plain build, a demo or a debug build never does, whatever its
report says. A failing report and removing the pairing both clear the state. The report is the reader's
own statement and no hardware attestation; plain readers show nothing here.

**Secured** also needs the fingerprints of the reader's Secure Boot keys, which the server records only
when it secures the reader. That procedure is not available yet, so secure readers show **Not secured**
for now. See [Reader Security](attractap/reader-security.md#reader-identity-and-the-secured-status).

### What an attacker can and cannot do

The code is derived from both sides' keys and random values, so approving it ties your decision to
exactly the reader and server that computed it. A Touch reader checks your server against a
commitment it received before the code was computed. An attacker who is **actively in the network
during the enrollment** can make a reader trust the attacker instead of your server, but cannot make
it trust your server in a way you would approve: the code the reader shows then differs from the
code the server computes, so your approval fails ("This code does not match the reader"). If a code that you read
correctly is rejected, stop and check the network before trying again. The reader only computes a
new code when your server's 30-second rotation allows it, so an attacker cannot make it run
through codes faster to find one that matches.

Attempts are limited: three per minute per connection, ten per ten minutes and twenty waiting
requests per address, 200 waiting requests in total, and five wrong codes per admin per minute.
For the per-address limits to work behind a reverse proxy, set `TRUST_PROXY` (see below).

## Operations

### Backup

The installation identity (a certificate authority for readers and the server certificate) is
stored in the database. The CA private key and the server key are stored **encrypted** with a key
derived from `AUTH_SESSION_SECRET`; the certificates themselves are not secret.
**Back up the database and `AUTH_SESSION_SECRET` together.** If the secret is lost, or changed
without converting the stored keys, the keys cannot be decrypted and every reader has to be paired
again. To change the secret, follow the rotation steps in
[Security settings](settings/security.md), which convert these keys too.

### Reverse proxies

The reader selects its transport with the WebSocket subprotocols `attractap-session.v1`
(encrypted session) and `attractap-pairing.v1` (pairing). A reverse proxy must pass the
`Sec-WebSocket-Protocol` header in both directions. If it strips the header, paired readers cannot
connect: from the second failed attempt in a row, a Touch reader shows **Secure connection failed.
Check the server or proxy.** on its connecting screen and a Lite reader flashes **red** after each
failed attempt.
They keep retrying and never fall back to an unencrypted connection.

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

| Reader firmware   | Behaviour with this server                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| older than 1.8.0  | Signs in with its token or the old registration request, gets the latest firmware over the air, then pairs.                                                             |
| 1.8.0 up to 2.5.x | Paired over the encrypted connection: shows its code again after the upgrade and pairs again. Still signing in with a token (never paired): updates over the air, then pairs. |
| 2.6.0 and newer   | Pairs with the flow on this page and never offers a token.                                                                                                              |

### Metrics

`attraccess_attractap_sessions_active`, `attraccess_attractap_handshake_queue_depth` and
`attraccess_attractap_handshake_failures_total{reason}`.
