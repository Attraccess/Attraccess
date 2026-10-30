# Reader Pairing and Encrypted Connection

A paired reader has its own key and talks to the server through an authenticated, encrypted
TLS 1.3 session that runs inside the normal WebSocket. Plain `ws://` works, `wss://` is
optional, and the reader always checks which server it is talking to.

Readers that are not paired keep working exactly as before (token sign-in), and so do readers
with older firmware. Both kinds can use the same server at the same time.

## Reader states

| State               | Meaning                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Not paired**      | The reader signs in with its token. This is the state of every reader after an update of the server.                                   |
| **Waiting to pair** | A pairing for the reader is running.                                                                                                   |
| **Paired**          | The reader has its own key and certificate. Token sign-in is no longer possible for it.                                                |
| **Revoked**         | An admin removed the pairing. The live connection ends within a second and the device appears under **Not paired** in the reader list. |

## Pairing a reader

You need the `resources.update` permission (shown as **Update Resources** in the role editor).
Pairing actions take effect immediately; you do not need to save the reader afterwards.

1. On the readers page, the **Not paired** card above the reader tables lists everything that
   still needs pairing, each with a single **Pair** button:
   - readers that sign in with their token, and
   - devices that announced themselves without a valid pairing (revoked, reset on the device or
     new). For these you choose whether it is a new reader, a re-pair of an existing record, or
     the replacement of an existing record.

   The reader must be online. For a token reader, the server asks it through its existing token
   connection to start pairing and hands it a one-time pairing ticket, which ties the pairing to
   this record. The token itself is never sent in pairing messages. A pairing that is already
   running shows **Continue** instead.

2. The dialog shows a code and a five minute countdown.
   - **Touch readers** show six digits, for example `471 903`.
   - **Lite readers** show eight coloured LED segments. Segment 1 blinks on the reader to mark
     the start. Below the dots, the dialog lists the colour names numbered by segment, for
     example "1 Red, 2 Green, 3 Blue, …".
3. Compare the code with the code on the reader. If it matches, confirm in the dialog **and** at
   the reader (Touch: **Codes match**; Lite: hold any NFC card to the reader within two minutes —
   the card is not looked up and nothing about it is sent).
4. Pairing finishes only when both sides confirm within five minutes. Cancel, timeout or a
   mismatch aborts it; a new attempt always uses a new code. When a pairing ends without
   success, the dialog tells you why (for example cancelled at the reader, reader disconnected
   or timed out).

### Plain HTTP

If the admin page is opened over plain HTTP (not HTTPS and not localhost), the dialog shows a
warning: someone who controls the network could show you a fake code. Use HTTPS or a network you
trust when pairing. Pairing is not blocked.

## Re-pair, replace and revoke

These actions are in the **Security** tab of the reader editor of a paired or revoked reader.
Each one is explained next to its button.

- **Re-pair**: same device, new key. Use it after the pairing was reset on the device. The old
  credential is revoked.
- **Replace**: a different device takes over the reader's name, resources and settings, for
  example after swapping broken hardware. The old credential is marked as replaced.
- **Revoke**: locks the reader out right away. It asks for confirmation, then ends the session and
  the reader shows "Pairing removed – ask an admin to pair this reader". It never falls back to
  token sign-in, stays in the list, and the device appears under **Not paired**.

Re-pair and Replace need the device to appear under **Not paired** first: revoke the old
pairing or reset the pairing on the device, wait until it is listed, then choose **Re-pair** or
**Replace**. The dialog lists every waiting device with its type, key and the time it announced
itself, so you can pick the right one.

Every credential is kept in the **credential history** of the reader, also after the reader is
deleted. Each entry shows the key, the certificate serial and the user who caused it; the
Security tab also shows who paired the reader.

## Backup

The installation identity (a certificate authority for readers and the server certificate) is
stored in the database, and its private keys are encrypted with `AUTH_SESSION_SECRET`.
**Back up the database and `AUTH_SESSION_SECRET` together.** If the secret is lost or changed,
the keys cannot be read any more and every reader has to be paired again. Rotating the
certificate authority is not supported.

## Reverse proxies

The reader selects its transport with the WebSocket subprotocols `attractap-session.v1`
(encrypted session) and `attractap-pairing.v1` (pairing). A reverse proxy must pass the
`Sec-WebSocket-Protocol` header in both directions. If it strips the header, paired readers
cannot connect and show a clear error; they never fall back to an unencrypted connection.

The server refuses unknown `attractap-*` subprotocol versions (for example `attractap-session.v2`)
with HTTP 400 during the WebSocket upgrade. Connections without a subprotocol are older readers
and keep working with token sign-in.

## Metrics

`attraccess_attractap_sessions_active`, `attraccess_attractap_handshake_queue_depth` and
`attraccess_attractap_handshake_failures_total{reason}`.
