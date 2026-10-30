# WAGO integration threat model and pen-test brief

This page is the production-assurance threat model for the WAGO CC100 integration (ATT-988). It lists what the
integration protects, where trust changes, what can go wrong, which code stops it today, and which gaps remain.
It is an input for a penetration test and an external safety review. **Neither has been performed.** Passing
this model is not a security or safety certification, and physical use stays unqualified until ATT-984.

Every gap carries one tag:

- **fixed here**: closed by the ATT-988 change set that introduced this page.
- **ATT-1057**: reported to [ATT-1057](https://linear.app/attraccess/issue/ATT-1057) (baseline controller hardening, TLS/trust, safe commissioning, recovery). Not fixed here.
- **accepted risk**: understood, not planned to change, with the reason.

Code references name a file and symbol in `apps/plugins/wago/` so they survive line drift.

## Actors and trust boundaries

| Boundary | Trusted side | Less trusted side |
| --- | --- | --- |
| B1 Browser to API | Attraccess session with plugin permissions | Any network client |
| B2 API to broker | Attraccess host and its MQTT server record | The broker and everything that can publish on it |
| B3 Broker to controller | Per-controller broker account with a topic policy | The controller runtime and anything on its LAN |
| B4 Host to plugin | Plugin code inside its declared permissions | Other plugins |
| B5 API to controller over SSH | Operator-supplied SSH key, used only by managed updates | The controller's host OS |

Messages from the controller (B3) are **untrusted input** even after authentication: a credential leak or a
runtime fault must not be able to exhaust the server.

## 1. Enrollment

**Assets:** the controller's identity (`hardwareId`), the pairing code and fingerprint, the one-time enrollment
secret, the per-controller broker credential handed over on claim.

**Trust boundaries:** B2, B3. The discovery credential is shared with an unclaimed controller and can only
publish its own announcement and claim acknowledgement and subscribe to its own claim topic.

**Threats:** a rogue device announces a victim's `hardwareId`; an attacker replays or guesses a pairing code;
a claim is intercepted and reused; an old claim overwrites rotated credentials; an oversized announcement
exhausts the server.

**Current protections**

- The operator must present a verifier that matches the stored pairing-code hash or fingerprint, compared in constant time (`controllers/service.ts` `matchesVerifier`, `controllers/model.ts` `safeEqual`).
- Enrollment secrets are stored as hashes, bound to server and `hardwareId`, expire, and are single use (`controllers/service.ts` `validEnrollment`, `isActiveEnrollment`).
- The discovery account is limited to the controller's own discovery topics (`controllers/enrollment.ts` `topicPolicy`).
- The claim carries an acknowledgement token that the server compares in constant time (`controllers/model.ts` `isClaimAcknowledgement`); manual claims can expire within 60 seconds (`claim-expiry-v1`, `cc100-runtime/src/runtime/identity/discovery.ts`).
- A claimed registration has a `credentialEpoch`; a claim without or with a different epoch cannot overwrite rotated credentials (`discovery.ts` `receiveDiscoveryClaim`).
- Announcements and claim acknowledgements are size and depth checked before parsing (`backend/protocol/index.ts` `parseControllerJson`).

**Gaps**

| Gap | Tag |
| --- | --- |
| Announcements were parsed at any size. | fixed here |
| The claim topic on the controller accepted unbounded payloads before decoding. | fixed here (64 KiB drop, counted) |
| Discovery and claim run over whatever transport the MQTT server record uses; without TLS the claim password crosses the LAN in clear. | ATT-1057 |
| Pairing codes are short; there is no server-side attempt lockout. | ATT-1057 |

## 2. MQTT authorization

**Assets:** command authority over physical outputs, telemetry integrity, broker availability.

**Trust boundaries:** B2, B3.

**Threats:** a controller account publishes or subscribes outside its namespace; one controller impersonates
another; a leaked credential keeps working after rotation; a client floods the broker or the server's wildcard
subscription.

**Current protections**

- Each controller gets its own account whose policy allows publishing under its own `controllers/<hardwareId>/#` and subscribing only to its desired configuration, commands and credential-rotation topics (`controllers/enrollment.ts` `topicPolicy`).
- The server checks the originating server and exact topic of every message before use (`controllers/subscriptions.ts`, `credentials/service.ts`).
- Credential rotation changes the broker password, persists an encrypted recovery copy and completes only after the controller reconnects with it ([credential rotation](wago-credential-rotation.md)).
- The broker ACL is enforced by the broker, not by this plugin.

**Gaps**

| Gap | Tag |
| --- | --- |
| The host's MQTT layer has no message-size cap; one oversized publish is delivered to every subscriber. Mitigated only by the recommended broker limit (2 MiB, see [production support](wago-production-support.md)). | accepted risk (host-wide cap is a recorded non-goal) |
| The plugin cannot verify that the broker actually enforces the topic policy it requested. | accepted risk (operator verifies with the lab exercises) |
| Transport security and broker identity verification. | ATT-1057 |
| Controller messages are not signed; anyone with the controller's own credential can speak as it. | accepted risk (bounded by per-controller ACL and rotation) |

## 3. Protocol parsing

**Assets:** server memory and event-loop time, the diagnostics store, the integrity of stored controller state.

**Trust boundaries:** B3 into the server (heartbeats, state, measurements, faults, acknowledgements, configuration
reports, claim and rotation acknowledgements) and B2 into the controller (commands, desired configuration, claims,
rotation messages).

**Threats:** oversized or deeply nested JSON; a flood of small messages; malformed envelopes; sequence games to
hide or replay state; fault text carrying secrets or log injection.

**Current protections**

- Every controller payload is decoded through one function that checks the byte length (64 KiB) and nesting (8 levels) before `toString` and `JSON.parse` (`backend/protocol/index.ts` `parseControllerJson`). The entry points are announcement, heartbeat, operational messages, diagnostics, command acknowledgements, claim acknowledgements, rotation acknowledgements, configuration reports and the commissioning readiness probe. Network-change acknowledgements keep their stricter 1 KiB check (`network/service.ts`).
- Timestamps, sequences and stream identifiers are validated, and streams are tracked so replays and out-of-order samples are not shown as current (`protocol/index.ts` `parseOperationalMessage`, `diagnostics/store.ts`).
- The diagnostics store is bounded in controllers, channels and events (`diagnostics/store.ts`).
- On the controller, each subscription has a byte cap, at most 100 messages handled at once and at most 100 waiting; drops are counted by reason and never answered (`cc100-runtime/src/transport/admission.ts`).
- Controller reports are capped: rejection reports at 50 errors and 64 KiB, readiness errors at 8 KiB, fault text at 1 KiB (`cc100-runtime/src/runtime/bounded.ts`).

**Gaps**

| Gap | Tag |
| --- | --- |
| Server entry points read payloads of any size. | fixed here |
| The controller handled unbounded concurrent messages and reports. | fixed here |
| Message-rate limiting per controller on the server is limited to what the diagnostics store bounds. | accepted risk (a flood costs bounded memory; broker-level rate limits are the operator's control) |
| The 100/100 admission limit is per subscription, not per client. | accepted risk |

## 4. Configuration

**Assets:** the channel map that decides which physical output a command moves and what safe state means.

**Trust boundaries:** B1 (editor), B2 (publishing), B3 (controller acceptance).

**Threats:** a crafted or accidental configuration remaps outputs; a hash or revision is spoofed; a
configuration is so large or deep that the controller cannot report on it; a rollback reintroduces a
dangerous mapping.

**Current protections**

- Configurations are versioned, canonicalised and hashed; the controller rejects a hash mismatch, an unknown field, a stale revision, or an invalid guard, feedback, pulse, disconnect policy or measurement (`cc100-runtime/src/runtime/configuration/validation.ts`, `configuration.ts`).
- Output routing cannot change while an output is on (`outputs/controller.ts` `assertConfigurationSafe`).
- The editor validates the same rules before publishing (`backend/configuration/model.ts` `validateEditorSnapshot`).
- New limits refuse configurations over 1 MiB, nested deeper than 16 levels, with IDs over 256 characters or control characters, more than 256 channels or points, or a worst-case status report over 64 KiB (`shared/configuration-limits.ts`). They apply to new revisions and rollbacks in the editor, the API and the runtime; a running or redelivered configuration is never rejected for them.

**Gaps**

| Gap | Tag |
| --- | --- |
| No size, depth, ID or count limits on configurations. | fixed here |
| Configuration is authorised by broker ACL on the desired topic only; there is no signature over a revision. | ATT-1057 |
| A rollback publishes an old revision unchanged; its review is the operator's responsibility. | accepted risk |

## 5. Commands

**Assets:** the physical outputs.

**Trust boundaries:** B1, B2, B3.

**Threats:** replayed or expired commands; commands against a stale configuration; flooding to starve the
output queue; a slow output blocking others; commands bypassing guards or manual front-panel control.

**Current protections**

- Commands carry an `id`, an `expiresAt` and the `expectedConfigurationRevision`; expired, duplicate and stale-revision commands are rejected and de-duplicated across restarts (`cc100-runtime/src/runtime/commands/commands.ts`).
- Guards, feedback, pulse limits and disconnect policies are enforced on the controller, not only in the UI.
- Writes are serialised per channel with a bounded queue (`queue_full`).
- Commands above 64 KiB are dropped unparsed; a command releases its handling slot when it joins its channel queue, so one slow output cannot hold the other 99 slots (`runtime/commands/commands.ts`, `transport/admission.ts`).
- A dropped command gets no reply. The server's command timeout fires exactly as for an offline controller.

**Gaps**

| Gap | Tag |
| --- | --- |
| Unbounded command payloads and concurrency on the controller. | fixed here |
| Commands are authorised by who may publish on the controller's command topic (the server's broker account); no per-command signature. | ATT-1057 |
| Dropped commands are indistinguishable from an offline controller to the caller. | accepted risk (counts are visible in diagnostics) |
| Software commands are not a safety function; there is no certified safe-torque or emergency-stop path. | accepted risk (documented in [safety boundary](wago-safety-boundary.md)) |

## 6. Plugin boundaries

**Assets:** the host database and secrets, other plugins' data, the shared MQTT connections.

**Trust boundaries:** B4.

**Threats:** the plugin reads another plugin's secrets; the plugin reaches host internals; another plugin
reads WAGO secrets; a plugin sends more than it declared.

**Current protections**

- Declared permissions (`plugin.json`: `DATABASE_ACCESS`, `ACCESS_MQTT_SERVERS`, `TRIGGER_FLOWS`, `MANAGE_SECRETS`) are enforced by the host's guarded context.
- Plugin secrets are encrypted with a key derived per plugin ID from the server secret (`apps/api/src/encryption/encryption.service.ts` `getPluginEncryptionKey`).
- A lint rule and a module-boundary script keep the plugin from importing host internals or other plugins (`scripts/lint-module-boundaries.mjs`).

**Gaps**

| Gap | Tag |
| --- | --- |
| The MQTT context is shared by all plugins with `ACCESS_MQTT_SERVERS`; there is no per-plugin topic scoping. | ATT-1057 |
| A host-wide message-size cap does not exist. | accepted risk (recorded non-goal; broker limit recommended) |

## Pen-test brief

**Goal:** find ways to move an output without being authorised, to deny service to the server or controller with
input, or to read or alter another party's secrets.

**In scope**

- Controller-originated MQTT on every topic in sections 1 to 3 against a test Attraccess server.
- Server-originated MQTT against the controller runtime (commands, desired configuration, claims, rotation).
- The plugin HTTP API for configuration, commands, commissioning and credential rotation.
- The simulator runtime ([simulator README](../../../apps/plugins/wago/cc100-runtime/README.simulator.md)); no physical controller is required.

**Out of scope:** the broker software itself, the Attraccess host outside the plugin, physical attacks on a CC100,
and denial of service that only saturates network bandwidth.

**Entry points to attack**

| Entry point | Direction | Limit to try to break |
| --- | --- | --- |
| `attraccess/wago/discovery/<hardwareId>` | controller to server | 64 KiB, 8 levels |
| `.../controllers/<id>/heartbeat`, `state`, `measurements`, `faults`, `acknowledgements` | controller to server | 64 KiB, 8 levels |
| `.../controllers/<id>/configuration/reported` | controller to server | 64 KiB, 8 levels |
| `.../discovery/<id>/claim/ack`, `.../credentials/rotate/ack` | controller to server | 64 KiB, 8 levels |
| `.../controllers/<id>/commands` | server to controller | 64 KiB, 100 at once |
| `.../controllers/<id>/configuration/desired` | server to controller | 1 MiB, config limits |
| `.../discovery/<id>/claim`, `.../credentials/rotate` | server to controller | 64 KiB |

**Fixtures and accounts the tester needs**

- A disposable Attraccess instance with the WAGO plugin installed, an admin account, and a second account without WAGO permissions.
- A dedicated RabbitMQ 4 broker (or the reliability harness broker) with an administrative account for the tester, and one low-privilege account per simulated controller created by the normal enrollment flow.
- At least two simulated controllers (`docker-compose.simulator.yml`) so cross-controller impersonation can be tried.
- The pairing code and fingerprint of one unclaimed controller; none of a claimed one.
- No physical CC100 and no production broker.

**Report back:** each finding with the topic or endpoint, payload, observed effect and the limit it bypasses.
Findings that need baseline hardening are filed against ATT-1057.
