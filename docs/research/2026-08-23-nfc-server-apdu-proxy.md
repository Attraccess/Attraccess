# NFC Server-Side Cryptography Through APDU-Proxied Readers

- Date: 2026-08-23
- Scope: ISO 14443A / ISO-DEP readers, with the existing PN532-based hardware in mind.
- Question: can reader encryption/authentication be centralized while a reader forwards byte/hex APDUs?

## Decision

**Yes, with a protocol boundary: centralize the APDU application and its
cryptographic/session state, but keep ISO-DEP and all radio-time-critical work
at the reader.** Treat the reader as an *APDU* proxy, not a raw ISO 14443 frame
proxy. This removes card diversification and secure-messaging keys from the
reader in the normal case, but it does not make a compromised reader harmless
and it does not provide proximity assurance.

The reader must locally own activation, ATS parsing, frame-size negotiation,
I/R/S-block sequencing, retransmission, waiting-time-extension (WTX) handling,
and card-loss/deactivation. It may send complete C-APDUs to a server and return
complete R-APDUs. The server must own one ordered, exclusive state machine per
card activation and serialize every secure-messaging command. A server round
trip must never be required to acknowledge a chained ISO-DEP frame or answer a
WTX request.

This is a conditional feasibility result, not a claim that every card protocol
can safely be remote. Validate it against the exact credential/card product and
the licensed standards. ISO/IEC 14443-4 is the normative transmission protocol;
ISO describes it as a half-duplex block protocol with activation and
deactivation. ISO/IEC 7816-4 defines command-response pairs, secure messaging,
and is independent of the physical interface, including RF. [1][2]

## Protocol And Timing Boundary

### Layers

| Layer | Owner in a safe remote design | Why |
| --- | --- | --- |
| RF field, polling, anticollision, RATS/ATS, deselect | Reader | Direct RF hardware control and card-presence detection. |
| ISO-DEP blocks, block number, frame chaining, retransmit, WTX | Reader | These reactions occur inside the contactless transport exchange. |
| Complete C-APDU/R-APDU transport | Reader <-> server | A durable, authenticated, ordered tunnel is sufficient. |
| Select/authenticate command sequence, diversification, secure-messaging MAC/encryption, counters, authorization decision | Server session actor | The server can retain the keys and mutable authenticated-session state. |

The PN532 path can support this split at the controller boundary: the PN53x
driver exposes `InCommunicateThru` for an RF exchange, configures the response
timeout locally, and maps a controller timeout to a contactless timeout. [3]
That is an implementation observation, not a replacement for NXP's controller
manual. The same source caps a PN532 host command frame at 265 bytes, another
reason the reader must handle fragmentation rather than blindly expose one
unbounded "hex APDU" call. [3]

### ISO 14443 frame waiting time

For ISO-DEP Type A, the ATS supplies FWI. A widely used open-source ISO-DEP
implementation calculates `FWT = (4096 / 13.56 MHz) * 2^FWI`, and uses the
result as the receive timeout after it sends a frame. [4] The base is about
302.1 microseconds, yielding these useful reference values:

| FWI | FWT |
| ---: | ---: |
| 0 | 0.302 ms |
| 4 | 4.833 ms |
| 8 | 77.3 ms |
| 14 | 4.95 s |

`FWI = 14` is the largest normal value handled by that implementation; values
above it are treated as reserved and replaced with a default. [4] Use the ATS
actually received from a deployed card, not the most forgiving table value, as
the engineering budget.

FWT starts when the reader has transmitted the PCD frame. Therefore, an
APDU-level server RTT *before* the reader transmits the next C-APDU does not by
itself consume that FWT. It does, however, extend the user's tap duration and
risks card movement, RF loss, application/card inactivity limits, and an
unrecoverable secure-messaging session. Conversely, if the server must decide
how to respond after a card I-block, the server RTT is directly in the critical
path and is unacceptable for normal WAN/Wi-Fi tail latency.

WTX is not a general cure for server delay. The card requests WTX while the
reader is waiting for the card; the reader must promptly return the WTX response
and adjust its local waiting window. The cited implementation detects an
ISO-DEP WTX S-block and immediately continues its local exchange with a timeout
multiplied by the card-provided WTX multiplier. [4] A remote server cannot be
allowed to perform that response.

### Chaining Is Stateful At Two Layers

Do not conflate these mechanisms:

| Mechanism | What is split | Required owner |
| --- | --- | --- |
| ISO-DEP I-block chaining | One transport payload across RF frames; includes block numbers, ACKs, retries, and WTX | Reader |
| ISO 7816 command chaining / extended APDUs | Logical command data across APDUs or larger APDU encodings | Server session actor, subject to card profile |
| Card-vendor continuation (for example, a proprietary "additional frame") | Card command sequence and often secure-message counter evolution | Server session actor, with the reader preserving the RF session |

The ISO-DEP reference implementation fragments a command by negotiated MIU,
marks intermediate I-blocks as "more," requires an ACK before sending the next
fragment, reassembles chained responses, and verifies the protocol number on
each block. [4] This proves why raw-frame forwarding is not an APDU proxy: a
server delay can break a required local ACK/retry even if the server understands
the bytes. ISO/IEC 7816-4 is the normative reference for APDU command-response
pairs and secure messaging. [2]

## Network Behavior

### Slow And High-Latency Links

A server-side APDU executor is practical on a stable local network when the
reader retains the full ISO-DEP transaction and the human keeps the card in the
field. It is unsuitable to depend on for door/turnstile-like UX over a WAN or
unmanaged Wi-Fi without measured tail-latency and card-removal tests.

Design rules:

1. Use one persistent, mutually authenticated reader-server connection. Avoid
   DNS, TCP, TLS, HTTP connection setup, retries, or serverless cold starts in
   a tap flow.
2. Give each activation a random `sessionId`, monotonically increasing
   `exchangeId`, reader identity, card activation metadata (ATS, negotiated
   sizes/FWI), deadline, and exactly one outstanding logical APDU.
3. Make the reader reject late, duplicated, out-of-session, or out-of-order
   server responses. Cancellation/card removal must invalidate the session;
   never apply a delayed R-APDU to a subsequent tap.
4. Set a separate user-tap/session deadline based on observed card behavior and
   product UX. It is not interchangeable with FWT. Record reader-to-server RTT
   and its p50/p95/p99, APDU count, RF timeouts, WTX count, and card-removal
   failures per credential type.
5. On link loss or missed deadline, abort locally: deselect/release the card,
   discard the server session, and require a new tap. Do not retry a
   state-changing card command unless the card protocol specifies idempotency
   and the server can prove the outcome.

If multiplexing is useful, QUIC provides authenticated encrypted connections
and independent ordered streams, but ordered delivery is per stream, not across
streams. [5] Use a single ordered stream (or explicit `exchangeId` gate) for
one card session; do not let transport multiplexing reorder secure-messaging
operations. QUIC improves connection management, not RF timing.

### Transaction And Secure-Session State

After authentication, many credentials derive session keys and maintain command
counters, IV/chaining values, selected application/file state, and transaction
state. A server-side executor can keep all of this; a stateless request handler
cannot. The server must use an activation-scoped actor/lease keyed by
`readerId + sessionId`, with single-flight command execution and explicit
terminal states:

```text
detected -> activated -> authenticating -> authenticated -> closing -> closed
                           |                  |
                           +-> failed         +-> failed
```

Persist only audit-safe metadata after `closed`: reader, card pseudonym, command
class/outcome, latency, and a correlation ID. Do not log raw APDUs, plaintext,
derived session keys, MAC inputs, nonces, or vendor continuation data by
default. Retain no session state after RF loss unless the exact card profile
documents safe resumption; normally, force reactivation and reauthentication.

## Security Implications

### Current Attraccess Boundary

The current firmware is a direct candidate for this change. It requests a card
key from the server, parses the 32-character hex value into a 16-byte buffer,
and invokes local authentication with it. [9] The card-authentication flow
passes those bytes to `NFC::authenticate`; enrollment and reset similarly pass
key material into local multi-command authenticate/change-key flows. [10][11]

The vendored NTAG424/DESFire implementation therefore currently retains key
material and mutable EV2 secure-messaging state on the reader: authentication
status, command counter, session encryption key, and session MAC key. [12]
Moving the APDU executor to the server would eliminate that key and
secure-session exposure from normal reader operation. It would not eliminate
the reader's ability to request an authorization operation or to actuate a
resource, so reader identity, firmware integrity, and authorization scope stay
security-critical.

The existing reader-server WebSocket has reconnect and liveness management,
and the repository already includes repeatable network fault injection for
two-second delay plus 30% loss, half-open sockets, Wi-Fi flaps, and DHCP
failure. [13][14] Reuse this tooling for the migration tests, but do not treat
its current message protocol as an ordered APDU session protocol without adding
the session, exchange, cancellation, and deadline rules below.

### Relay Attacks And Reader Trust

Moving crypto to a server does not stop relay attacks. A raw-frame proxy is
itself a relay primitive, and an attacker who controls a legitimate reader can
ask the server to perform genuine authentication for a card present elsewhere.
The original relay-attack paper demonstrates that an attacker can relay
challenge-response exchanges between a legitimate reader and card. [6]

Secure messaging protects integrity/confidentiality of the reader-card
conversation against many passive/active RF attacks, but normally proves only
that the card and key holder participated, not that the card was physically near
the policy-enforcing reader. Only an explicitly supported proximity/distance
bounding feature, deployed and measured according to its credential profile,
can address that property. Do not infer it from APDU encryption or a server's
network location.

Minimum controls:

1. Mutually authenticate the reader and server; pin or rotate device
   credentials, authorize each reader for a site/resource, and encrypt the
   tunnel.
2. Bind every server response to `readerId`, `sessionId`, `exchangeId`, and the
   activation/card parameters; enforce short expiry and single use.
3. Treat the reader as a trusted enforcement point for RF locality and output
   actuation. A compromised reader can relay, suppress, replay its own network
   messages where accepted, or grant access independently; central keys limit
   key exfiltration but do not solve this endpoint compromise.
4. Use anti-replay/card transaction counters where the credential supports
   them, and apply authorization policy server-side before state-changing
   commands.

### Key Storage

The strongest practical centralization keeps credential master keys and
diversification material in a server-side HSM/KMS; the APDU executor receives
only the operation result or short-lived derived material, never a broadly
exportable master key. Separate tenant/card-family key domains, restrict the
executor identity to required cryptographic operations, audit key use, and
rotate/revoke reader transport credentials separately from card keys.

If a deployment requires offline operation, prefer a dedicated secure element
or SAM with limited per-reader keys over plaintext firmware configuration. If
an ESP32-class reader must hold any secret, enable secure boot and flash
encryption in production and disable unnecessary debug/download paths. Espressif
states that flash encryption protects off-chip flash from physical readout, its
key is in eFuse and normally inaccessible to software, and it recommends using
secure boot with flash encryption because flash encryption alone does not block
unauthorized firmware. [7][8] This reduces extraction risk; it is not an HSM
and does not make a compromised running reader trusted.

## Recommended Architectures

### 1. Online APDU Gateway: Recommended Default

```text
card <-> reader (RF + ISO-DEP) <-> mTLS persistent tunnel <-> session actor/HSM
```

Reader responsibilities:

- Keep RF and ISO-DEP entirely local, including all chaining, WTX, retries, and
  deselection.
- Forward only complete APDU request/response units plus negotiated activation
  metadata.
- Enforce one active card per RF front end, sequence IDs, local session timeout,
  and fail-closed output policy.

Server responsibilities:

- Allocate one exclusive activation actor and own APDU/authentication sequence,
  secure-messaging state, key derivation, and authorization.
- Produce the next C-APDU only after processing the preceding full R-APDU.
- Cancel state on card removal, reader disconnect, or timeout; never resume it
  on another reader/session.

This is the only architecture that meets the objective while preserving normal
ISO-DEP operation over non-deterministic networks.

### 2. Edge Cryptographic Worker: Use When Tap Latency Or Availability Demands It

```text
card <-> reader (RF) <-> local edge worker/HSM or SAM <-> central policy/audit
```

Put the whole protocol executor next to the reader when measured user-tap time,
local network failure, vendor proprietary authentication timing, or a
proximity-sensitive application makes a server dependency unacceptable. Central
systems distribute policy and audit events; the edge makes the immediate
decision. This deliberately trades more distributed key custody for predictable
latency and offline behavior.

### 3. Raw-Frame Server Proxy: Do Not Use

```text
card <-> reader <-> network <-> server deciding each ISO-DEP frame
```

This design places network jitter inside FWT/WTX/chaining/retransmission paths.
It will fail intermittently and can become an attacker-controlled relay service.
It is appropriate only as a laboratory trace tool with a local deterministic
link, not as an access-control architecture.

## Verification Plan

1. Select the exact card families and obtain their vendor command and timing
   specifications. Record ATS/FWI/FSC, authentication type, secure-messaging
   counter behavior, WTX behavior, continuation semantics, and transaction
   commit/abort behavior.
2. Implement the reader/server boundary at complete APDUs. Add a deterministic
   test double that injects delay, duplicate/out-of-order delivery, disconnect,
   card removal, server restart, and reader reboot at every exchange.
3. Capture RF traces while executing authentication, a multi-frame command, a
   WTX-capable operation, and a state-changing transaction. Verify no server
   RTT occurs between ISO-DEP chained-block reception and its required local
   response.
4. Establish acceptance budgets from measurement: card-present duration,
   end-to-end p95/p99, failure rate under impaired LAN/WAN, timeout behavior,
   and recovery requiring a fresh tap.
5. Threat-model stolen readers, a malicious enrolled reader, compromised reader
   firmware, tunnel replay, and a physical card relay. Test that identity,
   sequence, expiry, authorization scope, and cancellation controls reject each
   network-level case; separately decide whether the credential requires real
   proximity proof.

## Sources

[1] ISO, [ISO/IEC 14443-4:2018, *Transmission protocol*](https://www.iso.org/standard/73599.html). Normative protocol owner; its public abstract identifies the protocol as half-duplex block transmission and covers activation/deactivation.

[2] ISO, [ISO/IEC 7816-4:2020, *Organization, security and commands for interchange*](https://www.iso.org/standard/77180.html). Normative APDU and secure-messaging reference; public abstract lists command-response pairs and secure messaging and states physical-interface independence.

[3] nfcpy, [PN53x driver source](https://github.com/nfcpy/nfcpy/blob/master/src/nfc/clf/pn53x.py). Inspect `in_communicate_thru`, `send_cmd_recv_rsp`, and `host_command_frame_max_size` for a concrete PN532-family implementation of local timeout and controller exchange handling.

[4] nfcpy, [Type 4 / ISO-DEP source](https://github.com/nfcpy/nfcpy/blob/master/src/nfc/tag/tt4.py). Inspect `Type4ATag`/`Type4BTag` FWT calculation and `IsoDepInitiator.exchange` for frame chaining, retry, and WTX handling. This is implementation evidence; ISO/IEC 14443-4 remains normative.

[5] IETF, [RFC 9000: QUIC](https://www.rfc-editor.org/rfc/rfc9000.html), sections 1 and 2. Defines encrypted/authenticated connection behavior and ordered independent streams.

[6] Gerhard P. Hancke, [*A Practical Relay Attack on ISO 14443 Proximity Cards*](https://doi.org/10.1109/SECURECOMM.2005.9), IEEE SecureComm 2005. Original relay-attack research.

[7] Espressif, [ESP-IDF Flash Encryption](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/security/flash-encryption.html). Vendor guidance on eFuse-held flash keys, release mode, disabled download access, and the limits of flash encryption.

[8] Espressif, [ESP-IDF Secure Boot v2](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/security/secure-boot-v2.html). Vendor guidance on signed boot/application verification and use with flash encryption.

[9] Attraccess, `apps/attractap/firmware/src/api/api_cards.cpp`, `onCardAuthenticationDetailsResponse`, current repository source. Receives the server key as hex and copies it into `CardAuthenticationDetailsResponse::keyBytes`.

[10] Attraccess, `apps/attractap/firmware/src/application/application_cards.cpp`, `processCardAuthenticationData`, current repository source. Passes the received card key to local `NFC::authenticate`.

[11] Attraccess, `apps/attractap/firmware/src/application/application_state.cpp`, `processEnrollment` and `processReset`, current repository source. Passes server-supplied key material into local `NFC::changeKey` flows.

[12] Attraccess, `apps/attractap/firmware/src/nfc/Adafruit_PN532_NTAG424.h`, `ntag424_SessionType`, current repository source. Defines reader-resident EV2 authentication status, command counter, session encryption key, and MAC key.

[13] Attraccess, `apps/attractap/firmware/src/websocket/websocket.cpp`, current repository source. Implements reader WebSocket connection lifecycle, reconnect, and inbound liveness handling.

[14] Attraccess, [`tools/chaos-ap/README.md`](../../tools/chaos-ap/README.md), current repository source. Documents repeatable reader-server network delay, loss, black-hole, Wi-Fi-flap, and DHCP-failure injection.
