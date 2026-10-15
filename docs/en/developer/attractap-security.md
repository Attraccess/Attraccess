# Attractap identity and server-channel security

Decision record for [ATT-1143](https://linear.app/attraccess/issue/ATT-1143).
Date: 2026-10-15. Status: **candidate architecture, host feasibility demonstrated;
hardware and production integration unverified**. This is not a production security
certification. No firmware configuration or deployed reader changes with this record.

## Decision and deployment constraint

Plain `ws://` is a required deployment option. Select **mutually authenticated TLS
inside ordered binary WebSocket messages** for evaluation on existing ESP32-S3
boards, using a unique RSA reader certificate whose private operations use the DS
peripheral. WSS remains useful when available, but is not a prerequisite. A public
web certificate, HTTPS web interface, or TLS termination at the reverse proxy is
not required for the inner channel.

```text
Reader application JSON (framed)
  → inner TLS with reader certificate and verified server certificate
  → binary WS messages → customer HTTP/WS proxy
  → binary WS messages → inner TLS in Attraccess API
  → authenticated reader registry → existing event handlers
```

The selected established cryptographic protocol is TLS, not a new AES/JSON scheme.
[TLS 1.2](https://www.rfc-editor.org/rfc/rfc5246.html#section-1) operates over a
reliable transport. Ordered WS payloads can supply that byte stream; this mapping
is our adapter, not a standardized TLS-over-WS application protocol. The host bench
below demonstrates feasibility of that mapping. It does not validate the firmware
adapter, proxy compatibility, or production API.

“No WSS endpoint” differs from “no TLS implementation anywhere.” This design
terminates TLS **inside the API after the WS upgrade**, not on the customer-facing
HTTP listener. The October 14 requirement is satisfied at the outer transport
level. If a customer also prohibits inner TLS records or the API cannot run a TLS
library, that constraint remains unresolved: do not fall back to bearer tokens or
invent a second protocol. Evaluate a maintained established alternative and its
hardware signing support separately. Noise would require a compatible identity
primitive and library; ESP32-S3 DS RSA is not a drop-in Noise DH static key.

## Attacker models and bounded claims

Network attacker: controls DNS, LAN and proxy traffic; can observe, alter, delay,
duplicate, inject and disconnect messages and offer a fake server. Desired claim:
application confidentiality and integrity, authenticated endpoints and rejection
of recorded ciphertext, assuming uncompromised endpoints, provisioned trust and
sound random generation. Connection metadata, certificate identities in TLS 1.2,
traffic length/timing and denial of service remain exposed. The HTTP admin UI
itself is not protected by securing the reader channel; admin trust changes need
an independently protected management path or physical provisioning.

Physical qualification target for an existing-board production profile: a captured
reader, enclosure opened, seven days, EUR 1,000 equipment budget, ordinary USB/UART,
debug probes and flash programmers. Goal: resist extraction/cloning of the identity
through supported APIs, diagnostics, debug ports and routine flash reads. This
budget is a proposed test boundary, not a measured resistance level. Fault injection,
decapsulation, microprobing and side-channel laboratories are outside this initial
qualification. No tested physical-resistance claim can be made today.

A stolen genuine reader may still authenticate and request operations until
revoked. A compromised running host can request signatures, steal session keys and
read plaintext even if it cannot export the identity key. Secure boot does not
eliminate runtime vulnerabilities. Availability and access authorization require
separate controls.

Candidate scope: repository variants `attractap-touch`, `attractap-touch-v2`,
`attractap-touch-ethernet` and `attractap-lite-ethernet` only where the actual MCU is ESP32-S3 with sufficient usable eFuse
blocks, using project-local ESP-IDF v6.0.2. Exact board revision, SoC ECO revision,
module/flash/PSRAM part, eFuse state and bootloader digest must be inventoried per
qualification unit. **No board/ECO revision is qualified yet.** Other ESP32 models
and already-locked or insecurely provisioned devices need separate review.

## Identity choice

| Mechanism         | Cost and integration                                                                                                                        | Decision and remaining exposure                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eFuse-backed HMAC | No board BOM change; consumes a suitable key block and needs protected symmetric provisioning plus server secret storage                    | Hardware proof is possible; does not encrypt the channel. Server secret compromise permits reader impersonation. Not the selected identity.                                                                                         |
| DS-backed RSA     | No board BOM change; eFuse wrapping key, encrypted parameters in flash, unique certificate, secure provisioning station and TLS integration | Selected existing-board candidate. Server stores a public identity, not a matching reader secret. Identity operations remain usable by compromised host software. Key creation initially exposes material to provisioning software. |
| Encrypted NVS     | Firmware/partition/provisioning changes; no added component                                                                                 | Required storage defense, not a non-exportable identity. Returned values and cached bearer tokens remain readable in RAM.                                                                                                           |
| ATECC608C         | Added component, PCB routing, assembly, provisioning and host/bus protection; obtain supplier quotes, no validated unit price               | Evaluate for a future board where stronger physical qualification is needed. Adds integration/library and supply-chain work. Does not hide host plaintext or prevent use of a stolen reader.                                        |

Espressif documents [DS wrapping and signing](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/api-reference/peripherals/ds.html):
encrypted RSA parameters reside in flash and an eFuse/HMAC-backed hardware path
performs private operations. Provisioning still creates the RSA and wrapping keys
in software. The v6.0.2 PSA DS driver is a candidate for inner TLS signing;
successful DS-backed WSS examples do not prove this custom stream integration.
[HMAC](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/api-reference/peripherals/hmac.html)
and [NVS encryption](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/api-reference/storage/nvs_encryption.html)
solve different problems. For a new board, review the exact
[ATECC608C capabilities](https://ww1.microchip.com/downloads/aemDocuments/documents/SCBU/ProductDocuments/DataSheets/ATECC608C-CryptoAuthentication-Summary-Data-Sheet-DS40002513.pdf)
and host integration. Any OPTIGA Trust M alternative requires a revision/library
review against [EUCLEAK](https://ninjalab.io/eucleak/).

[AR2026-005](https://documentation.espressif.com/AR2026-005_Security_Advisory_Concerning_AES_Key_Recovery_Using_Voltage_Fault_Injection_on%20ESP32-S3_EN.html)
reports voltage-fault recovery from the S3 general-purpose AES-128 peripheral,
distinct from XTS Flash Encryption. It neither demonstrates nor rules out attacks
on DS/HMAC. The bench's AES-256 suite does not establish physical fault resistance.
Review applicable advisories against each actual chip revision before qualification.

## Channel profile and initial trust

Candidate v1 uses TLS 1.2 with ECDHE, RSA certificates and AES-256-GCM
(`TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` in the host bench). Require Extended Master
Secret in production, disable renegotiation, compression, session resumption and
tickets initially. Do not allow anonymous, static RSA key exchange, CBC, null or
older TLS profiles. TLS 1.3 requires a separate DS signature/interoperability check;
it is not demonstrated here. RSA key size and padding support need firmware bench
qualification; the host bench uses disposable RSA-2048 keys.

During trusted physical/station provisioning, install the server trust anchor and
expected DNS name (or IP SAN), reader certificate and protected DS parameters.
Use a private installation CA with role-separated server and reader issuance;
retain CA signing keys outside the API process where possible. Reader certificates
must have clientAuth usage, server certificates serverAuth usage. Reader trust
cannot originate from a certificate downloaded over unverified WS, HTTP, DNS or
first-use acceptance. No reusable enrollment secret crosses clear transport.

Reader verifies server chain, intended identity, certificate validity and supported
profile before application traffic. API verifies the reader chain/usage and maps
the certified public key to an active installation-owned reader record; a trusted
CA signature alone does not authorize a reader. Do not trust a reader ID in JSON,
CN alone, or an unauthenticated WS upgrade header. Revocation must close active
connections as well as reject future handshakes and authorization attempts.

Cold boot needs a trusted time policy for certificate validity. Provision a signed
time floor, retain the highest authenticated time across reboots and qualify the
clock/bootstrap procedure; unauthenticated NTP is insufficient. When validity
cannot be established, fail closed and use protected local recovery. This procedure
is not validated by the current host bench. The bench only checks expired reader
certificate rejection with a host clock.

One TLS state machine per WS connection; never reuse traffic keys after reconnect,
power cycle or server restart. Fresh ECDHE and library RNG supply fresh secrets;
TLS owns nonce/sequence numbers and separate directional keys. Do not introduce
application-managed AES IVs. Persistent firmware state must not resume a previous
TLS record stream. Reconnect starts a full handshake and rechecks authorization.

TLS record replay rejection does not make an authorized application request safe
to retry. Resource actions need request IDs, bounded validity and server-side
idempotency appropriate to their side effects. Messages buffered across reconnects
must expire or be explicitly retried under that policy. TLS does not reject an
otherwise valid command solely because it is old.

## Adapter and API boundaries

Use a dedicated versioned WS route/subprotocol, for example
`/attractap/secure` and `attractap-inner-tls-v1`. A protected reader must never
negotiate back to legacy authentication after a timeout, certificate error, unknown
version or proxy rejection. The outer subprotocol selection is untrusted; local
policy plus the authenticated inner application version enforce the minimum.

Treat WS payloads as a byte stream. Records may span messages and messages may
contain multiple records. Firmware needs bounded RX/TX queues and MbedTLS BIO
callbacks that handle partial I/O, WANT_READ/WANT_WRITE, fragmentation and
disconnects. The Node API can wrap a WS Duplex with its maintained TLS library;
the bench uses [Node TLS](https://nodejs.org/api/tls.html#class-tlstlssocket) and
`ws.createWebSocketStream`. On fatal TLS errors close both TLS and WS streams;
otherwise a generic stream adapter can leave a connection hanging.

Inside TLS, frame UTF-8 JSON with a four-byte network-order length and a documented
maximum (candidate 64 KiB); reject oversized, incomplete and malformed frames.
Existing WS message boundaries cannot frame decrypted TLS data. Never pass outer
WS payloads directly into existing JSON event handlers. All reader commands,
replies, card data, configuration and diagnostics use the protected inner channel.
The bench uses short request/ack data only; it is not this production frame parser.

Before activation, cap WS payload size, concurrent unauthenticated connections,
handshake time and queued bytes. Disable per-message compression. Reject text on
the protected endpoint. Keep legacy readers isolated under an explicit per-reader
migration policy and show their weaker security status; never infer permission for
legacy mode from an attacker-controlled negotiation response.

## Provisioning and operations

No eFuses are burned by this change. Follow the exact chip-specific
[production security procedure](https://docs.espressif.com/projects/esp-idf/en/v6.0.2/esp32s3/security/security.html)
on sacrificial units first. The manufacturing sequence needs its own reviewed,
power-loss-safe station implementation and acceptance record:

1. Inventory chip/board revisions, toolchain, partitions and existing eFuses.
   Reserve compatible blocks for DS wrapping, flash encryption, secure boot and
   future revocation before choosing any irreversible layout.
2. Generate unique per-reader RSA and DS wrapping material on a protected station.
   Prepare encrypted DS parameters and certificate/public-key registration. Do
   not share wrapping keys or reader keys across units. Keep secrets out of station
   logs, shell arguments, backups and manufacturing databases; erase temporary
   material after verified provisioning. Station compromise remains a trust risk.
3. Validate signed production bootloader/app, encrypted storage and DS proof on
   a staged unit. Burn/read-protect the DS root only in the documented key-purpose
   sequence; verify using a hardware signature and public-key comparison, not key
   readback. Program flash encryption and secure boot using the release sequence
   for the chosen IDF/chip revision; do not apply an improvised generic burn order.
4. Verify cold boot, server trust, OTA, brownout recovery, diagnostics and approved
   recovery image. Then apply final write protections and debug/download locks
   according to the approved eFuse manifest. Record non-secret summaries before
   and after each stage; quarantine any partial failure.
5. Confirm routine flash readout and supported firmware interfaces cannot recover
   identity material. Keep public certificates, chip inventory and signed firmware
   manifests for support, but not plaintext reader private keys.

Production requires Secure Boot v2, release-mode Flash Encryption, NVS Encryption
and protected debug/download interfaces. Factory reset must not remove these
protections, revive revoked credentials or silently permit legacy enrollment.
Existing browser/USB flashing and unrestricted serial recovery cannot be promised
after release locks: offer a signed OTA recovery image and an audited replacement
procedure. Do not irreversibly lock fielded units without a tested recovery path.

Certificate renewal can reuse a DS public identity with proof of possession;
replacing the RSA identity requires newly wrapped parameters and protected
provisioning. eFuse wrapping-root replacement is limited by unused suitable blocks
and irreversible key purposes/locks, not unlimited software rotation. Inventory
capacity before promising rotation. Ownership transfer revokes old server records,
closes sessions, erases owner configuration and installs new trust through the
protected local process. A stolen reader is revoked immediately; replacement gets
a new identity. Server CA rotation needs an authenticated overlap period and an
offline recovery route. Signing key revocation and anti-rollback eFuse counters
are finite: test signed OTA, security-version bumps and recovery images together
before enabling anti-rollback in production.

## Secret handling found in the current repository

Baseline examined: `4f39f590`. These are findings, not fixes in this change:

- `apps/attractap/firmware/src/settings/settings.cpp` loads/stores `api.key` in NVS;
  normal settings return a readable string. Remove that reusable bearer credential
  after protected enrollment and successful migration; encrypted NVS alone cannot
  satisfy non-exportability.
- `apps/attractap/firmware/src/api/handlers/auth.cpp` sends the token in
  `READER_AUTHENTICATE`. `src/websocket/connection.cpp` permits unencrypted WS.
- `apps/api/src/attractap/websockets/handlers/auth/auth.handler.ts` logs whole
  registration/authentication inputs. Other generic gateway/diagnostic logging
  also needs a payload audit; avoid only fixing the named handler.
- `sdkconfig.defaults` enables flash coredumps, USB-Serial-JTAG console, PSRAM and
  MbedTLS external allocation. No checked-in production protection profile is
  established by these defaults. Inspect deployed eFuses separately.

The production profile must disable secret-bearing coredumps and TLS key logging,
redact registration/authentication and configuration payloads at the logging
boundary, and retain event codes, non-secret reader IDs, timings and error reasons.
Review crash uploads, support bundles, panic paths and provisioning console output.
Keep session buffers/keys in internal RAM where supported, zeroize on teardown and
audit allocator behavior; this reduces exposure but cannot protect plaintext from
a compromised host. Do not claim that DS automatically protects PSRAM/session keys.

## Reproducible host evidence

From the repository root, with installed dependencies, Node >=24 and an `openssl`
CLI (LibreSSL 3.3.6 was used):

```bash
node --test scripts/attractap-security/channel-bench.test.mjs
```

The bench creates temporary disposable software certificates, binds WS on an
ephemeral loopback port, runs inner TLS, and removes credentials on exit. It does
not use production keys, modify eFuses or connect to a reader. On 2026-10-15 with
Node v24.19.0: **12 tests passed**. Each negative test requires closure and no
unauthorized dispatch; a timeout fails the test. Tamper/replay tests additionally
require TLS error evidence. The positive test checks both directions and absence
of the request/response plaintext in captured WS payloads.

| Acceptance area                                          | Current evidence                                                                                                                                     | Still required                                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Threat model, supported revisions, security claims       | Bounded model and candidate scope above                                                                                                              | Actual board/ECO inventory; measured physical qualification                                                                  |
| Mechanism comparison and selection                       | Existing-board DS candidate, tradeoffs above                                                                                                         | Manufacturing cost/quote, eFuse capacity, DS driver qualification                                                            |
| Reader/API authenticated channel; HTTP-only installation | Host mutual authentication and bidirectional ciphertext over `ws://`                                                                                 | ESP32-S3 and Attraccess API integration; actual customer proxy                                                               |
| No WSS dependency and initial trust                      | Inner TLS architecture and host mapping demonstrated                                                                                                 | DS/MbedTLS BIO integration; customer constraints beyond no WSS                                                               |
| Forgery, server trust, tamper, replay, downgrade         | Host rejects forged/missing/expired/unenrolled/revoked readers, wrong CA/name, modified ciphertext, same/new-session replay, TLS 1.1, plaintext JSON | Reader cold-boot certificate validity, expired commands, application-version downgrade, production state machine and framing |
| Reconnect, power cycle, nonce state                      | Fresh host connection rejects prior ciphertext                                                                                                       | Reader power cycles, RNG failure/boot behavior, server restart, prolonged reconnect tests                                    |
| Identity not exported                                    | DS hardware design supported by vendor documentation                                                                                                 | Production firmware API/log/dump/flash/debug inspection and extraction attempts                                              |
| Provisioning and lifecycle                               | Required sequence and limits above                                                                                                                   | Station implementation, sacrificial-unit burns, ownership/rotation/revocation/recovery exercises                             |
| Diagnostics, coredumps, RAM and console                  | Current risks identified above                                                                                                                       | Redaction changes and production memory/configuration audit                                                                  |
| Architecture, bench evidence and migration scope         | This record and executable host bench                                                                                                                | Hardware evidence and rollout approval                                                                                       |

For hardware evidence, retain board/SoC IDs, non-secret eFuse summaries, firmware
and API commit IDs, tool versions, production sdkconfig, CA/public-key fingerprints,
capture hashes, test commands, expected/actual results, disconnect reasons and
operator/date. Capture forged identities and wrong trust failures before event
dispatch; altered/replayed records must close the session with no repeated action.
Repeat after reconnect, power cycle, server restart and supported recovery. Measure
handshake time, internal-RAM/PSRAM use, stack peaks and fragmentation under load.
Never include private keys, bearer tokens or TLS key logs in shared evidence.

## Implementation boundaries before rollout

The production work separates into reviewable changes: (1) production security
profile and provisioning tooling on sacrificial units; (2) DS-backed inner TLS
firmware adapter and framing; (3) API TLS/WS adapter, certificate registry and
revocation; (4) trusted enrollment, renewal/ownership/recovery and legacy migration;
(5) diagnostic redaction and memory audit; (6) representative-board and installed
proxy qualification with the evidence above. Do not enable security claims or
automatic legacy fallback before these gates pass.

Keep [ATT-950](https://linear.app/attraccess/issue/ATT-950) card-key/APDU migration
and [ATT-1033](https://linear.app/attraccess/issue/ATT-1033) reader BLE sessions
independent. This channel protects their reader/server traffic but does not replace
their protocols, move card keys by itself, or authenticate BLE provisioning.
