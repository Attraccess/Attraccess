# Reader Pairing and Encrypted Connection

A paired reader has its own key and talks to the server through an authenticated, encrypted
TLS 1.3 session that runs inside the normal WebSocket. Plain `ws://` works, `wss://` is
optional, and the reader always checks which server it is talking to.

Readers that are not paired keep working exactly as before (token sign-in), and so do readers
with older firmware. Both kinds can use the same server at the same time.

## Reader states

| State               | Meaning                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Not paired**      | The reader was never paired. This is the state of every reader after an update of the server. It keeps working as before. |
| **Pairing removed** | An admin removed the pairing. The reader disconnects within a second and cannot be used until it is paired again.         |
| **Paired**          | The reader is paired and can be used and set up.                                                                          |

Only paired readers are listed in the **Active** and **Stale** tables and can be edited. Every
other reader is listed in the **Not paired** card above the tables until it is paired.

## Pairing a reader

You need the `resources.update` permission (shown as **Update Resources** in the role editor).
Pairing actions take effect immediately; you do not need to save the reader afterwards.

1. On the readers page, the **Not paired** card lists every reader that must be paired, each with
   its type (Touch or Lite), its name and a single **Pair** button:
   - readers that were never paired,
   - readers whose pairing was removed (you pick which waiting reader takes the record back), and
   - **New reader** entries: readers that were reset or are new. For these you choose whether it
     is a new reader or one that takes over a reader you already have.

   The reader must be switched on and connected. A pairing that is already running shows
   **Continue** instead. Technically, the server asks a never-paired reader through its existing
   token connection to start pairing and hands it a one-time ticket that ties the pairing to the
   record; the token itself is never sent in pairing messages.

2. The dialog shows a code and a five minute countdown.
   - **Touch readers** show six digits, for example `471 903`.
   - **Lite readers** show eight coloured LED segments. Segment 1 blinks on the reader to mark
     the start. Below the dots, the dialog lists the colour names numbered by segment, for
     example "1 Red, 2 Green, 3 Blue, …".
3. Compare the code with the code on the reader. If it matches, confirm in the dialog **and** at
   the reader (Touch: **Codes match**; Lite: hold any NFC card to the reader within two minutes —
   the card is not looked up and nothing about it is sent).
4. Pairing finishes only when both sides confirm within five minutes. When it succeeds, a short
   message confirms it and the reader's settings open so you can set it up. Cancel, timeout or a
   mismatch aborts it; a new attempt always uses a new code. When a pairing ends without
   success, the dialog tells you why (for example cancelled at the reader, reader disconnected
   or timed out).

### Plain HTTP

If the admin page is opened over plain HTTP (not HTTPS and not localhost), the dialog shows a
warning: someone who controls the network could show you a fake code. Use HTTPS or a network you
trust when pairing. Pairing is not blocked.

## Pair again, remove pairing

These actions are in the **Pairing** tab of a paired reader's settings. Each one is explained
next to its button.

- **Pair again**: use it after the pairing was reset on the reader itself, or when you swap in a
  different reader, for example after a defect. Name, machines and settings stay; the old pairing
  stops working right away.
- **Remove pairing**: asks for confirmation, then disconnects the reader within a second. The
  reader shows "Pairing removed – ask an admin to pair this reader", the settings close, and the
  reader moves to the **Not paired** card. It never falls back to its old sign-in.

Pair again needs the reader to show up as **New reader** first: reset the
pairing on the reader itself and wait a moment. The dialog lists every waiting reader with its
type and since when it is waiting, so you can pick the right one.

The **History** in the Pairing tab lists every pairing and removal with the user who
did it and when. It is kept even after the reader is deleted.

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
