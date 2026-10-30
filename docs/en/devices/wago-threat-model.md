# WAGO integration threat model and pen-test brief

This page is the production-assurance threat model for the WAGO CC100 integration (ATT-988). It lists what the
integration protects, where trust changes, what can go wrong, which code stops it today, and which gaps remain.
It is an input for a penetration test and an external safety review. **Neither has been performed.** Passing
this model is not a security or safety certification, and physical use stays unqualified until ATT-984.

Every gap carries one tag:

- **fixed here**: closed by the ATT-988 change set that introduced this page.
- **reported for ATT-1057**: reported to [ATT-1057](https://linear.app/attraccess/issue/ATT-1057) (baseline controller hardening, TLS/trust, safe commissioning, recovery). Not fixed here.
- **accepted risk**: understood, not planned to change, with the reason.

Code references name a file and symbol so they survive line drift. Paths are relative to `apps/plugins/wago/` unless
they start with `apps/`.

## Actors and trust boundaries

| Boundary                      | Trusted side                                               | Less trusted side                                |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| B1 Browser to API             | Attraccess session with plugin permissions                 | Any network client                               |
| B2 API to broker              | Attraccess host and the MQTT server entry configured in it | The broker and everything that can publish on it |
| B3 Broker to controller       | Per-controller broker account with a topic policy          | The controller runtime and anything on its LAN   |
| B4 Host to plugin             | Plugin code inside its declared permissions                | Other plugins                                    |
| B5 API to controller over SSH | Operator-supplied SSH key, used only by managed updates    | The controller's host OS                         |

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

- The operator must present a verifier that matches the stored pairing-code hash or fingerprint, compared in constant time (`backend/controllers/service.ts` `matchesVerifier`, `backend/controllers/model.ts` `safeEqual`).
- Enrollment secrets are stored as hashes, bound to server and `hardwareId`, expire, and are single use (`backend/controllers/service.ts` `validEnrollment`, `isActiveEnrollment`).
- The discovery account is limited to the controller's own discovery topics (`backend/controllers/enrollment.ts` `topicPolicy`).
- The claim carries an acknowledgement token that the server compares in constant time (`backend/controllers/model.ts` `isClaimAcknowledgement`); manual claims can expire within 60 seconds (`claim-expiry-v1`, `cc100-runtime/src/runtime/identity/discovery.ts`).
- A claimed registration has a `credentialEpoch`; a claim without or with a different epoch cannot overwrite rotated credentials (`cc100-runtime/src/runtime/identity/discovery.ts` `receiveDiscoveryClaim`).
- Announcements and claim acknowledgements are size and depth checked before parsing (`backend/protocol/index.ts` `parseControllerJson`).

**Gaps**

| Gap                                                                                                                                                           | Tag                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Announcements were parsed at any size.                                                                                                                        | fixed here                        |
| The claim topic on the controller accepted unbounded payloads before decoding.                                                                                | fixed here (64 KiB drop, counted) |
| Discovery and claim run over whatever transport the MQTT server entry configured in Attraccess uses; without TLS the claim password crosses the LAN in clear. | reported for ATT-1057             |
| Pairing codes are short; there is no server-side attempt lockout.                                                                                             | reported for ATT-1057             |

## 2. MQTT authorization

**Assets:** command authority over physical outputs, telemetry integrity, broker availability.

**Trust boundaries:** B2, B3.

**Threats:** a controller account publishes or subscribes outside its namespace; one controller impersonates
another; a leaked controller credential is used to command that controller or replace its configuration; a leaked
credential keeps working after rotation; a client floods the broker, the server's wildcard subscription or a
controller's own subscriptions.

**Current protections**

- Each controller gets its own account. It may subscribe only to its own desired configuration, commands and credential-rotation topics, and publish only under its own `<namespace>/v1/controllers/<hardwareId>/#` (`backend/controllers/enrollment.ts` `topicPolicy` on claim; the same policy on rotation in `backend/credentials/service.ts` and on network change in `backend/network/service.ts`). One controller's account cannot publish or subscribe on another controller's topics.
- The publish grant is a multi-level wildcard. The RabbitMQ provider turns `#` into a pattern that matches every deeper level (`apps/plugins/rabbitmq/backend/credentials/provider.ts` `mqttFilterToRegex`). It therefore also covers the controller's **own** `commands`, `configuration/desired` and `credentials/rotate` topics, not only its reports. See the first gap below.
- The server checks the originating server and exact topic of every message before use (`backend/controllers/subscriptions.ts`, `backend/credentials/service.ts`).
- Credential rotation changes the broker password, persists an encrypted recovery copy and completes only after the controller reconnects with it ([credential rotation](wago-credential-rotation.md)).
- The broker ACL is enforced by the broker, not by this plugin.

**Gaps**

| Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Tag                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A controller's own account may publish on its own command, desired-configuration and credential-rotation topics, because its publish grant is `<namespace>/v1/controllers/<hardwareId>/#`. Whoever holds that one credential can send commands to that controller, publish a retained desired configuration with a hash they computed themselves (the hash proves integrity, not origin), and flood the controller's command subscription so real server commands, including output-off, are dropped as overload. The effect is limited to that controller. Narrowing the grant to the report topics is baseline ACL work. | reported for ATT-1057                                                                                                              |
| The host's MQTT layer has no message-size cap; one oversized publish is delivered to every subscriber. Mitigated only by the recommended broker limit (2 MiB, see [production support](wago-production-support.md)).                                                                                                                                                                                                                                                                                                                                                                                                       | accepted risk (host-wide cap is a recorded non-goal)                                                                               |
| The plugin cannot verify that the broker actually enforces the topic policy it requested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | accepted risk (operator verifies with the lab exercises)                                                                           |
| Transport security and broker identity verification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | reported for ATT-1057                                                                                                              |
| Controller messages are not signed; anyone with the controller's own credential can speak as it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | accepted risk (bounded by the per-controller ACL and rotation; what that credential can do to its own controller is the first gap) |

## 3. Protocol parsing

**Assets:** server memory and event-loop time, the diagnostics store, the integrity of stored controller state.

**Trust boundaries:** B3 into the server (heartbeats, state, measurements, faults, acknowledgements, configuration
reports, claim and rotation acknowledgements) and B2 into the controller (commands, desired configuration, claims,
rotation messages).

**Threats:** oversized or deeply nested JSON; a flood of small messages; malformed envelopes; sequence games to
hide or replay state; fault text carrying secrets or log injection.

**Current protections**

- Every controller payload the server reads is decoded through one function (`backend/protocol/index.ts` `parseControllerJson`). It refuses a payload over 64 KiB before `toString`, so an oversized message is never decoded. It then refuses nesting deeper than 8 levels by scanning the decoded text before `JSON.parse`. The entry points are announcement, heartbeat, operational messages, diagnostics, command acknowledgements, claim acknowledgements, rotation acknowledgements, configuration reports and the commissioning readiness probe. Network-change acknowledgements keep their stricter 1 KiB check (`backend/network/service.ts` `evidence`).
- Timestamps, sequences and stream identifiers are validated, and streams are tracked so replays and out-of-order samples are not shown as current (`backend/protocol/index.ts` `parseOperationalMessage`, `backend/diagnostics/store.ts`).
- The diagnostics store is bounded in controllers, channels and events (`backend/diagnostics/store.ts`).
- On the controller, every subscription has a byte cap checked before decoding and at most 100 messages waiting. Messages are handled up to 100 at once per subscription. Desired configurations are decoded only inside the configuration update lock, so at most one decoded configuration is held; the others wait as raw payloads (up to about 200 MiB in the worst case, which needs publish rights on the desired topic). Drops are counted by reason (`oversized`, `overload`) and never answered (`cc100-runtime/src/transport/admission.ts` `SubscriptionAdmission`, `cc100-runtime/src/transport/mqtt.ts`).
- Controller reports are capped: rejection reports at 50 errors and 64 KiB, readiness errors at 8 KiB, fault text at 1 KiB (`cc100-runtime/src/runtime/bounded.ts`).

**Gaps**

| Gap                                                                                                                                                                                                                                                              | Tag                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Server entry points read payloads of any size.                                                                                                                                                                                                                   | fixed here                                                                                                      |
| The controller handled unbounded concurrent messages and reports.                                                                                                                                                                                                | fixed here                                                                                                      |
| Message-rate limiting per controller on the server is limited to what the diagnostics store bounds.                                                                                                                                                              | accepted risk (a flood costs bounded memory; broker-level rate limits are the operator's control)               |
| The admission limits are per subscription, not per client.                                                                                                                                                                                                       | accepted risk                                                                                                   |
| Runtimes older than `0.3.0` publish rejection reports of any size. The server ignores any controller message over 64 KiB or nested deeper than 8 levels, so a very large rejection from an old runtime leaves the revision shown as published with no rejection. | accepted risk (update the runtime first, [runbook 5](wago-recovery-runbooks.md#5-runtime-upgrade-and-rollback)) |

## 4. Configuration

**Assets:** the channel map that decides which physical output a command moves and what safe state means.

**Trust boundaries:** B1 (editor), B2 (publishing), B3 (controller acceptance).

**Threats:** a crafted or accidental configuration remaps outputs; a hash or revision is spoofed; a
configuration is so large or deep that the controller cannot report on it; a rollback reintroduces a
dangerous mapping.

**Current protections**

- Configurations are versioned, canonicalised and hashed; the controller rejects a hash mismatch, an unknown field, a stale revision, or an invalid guard, feedback, pulse, disconnect policy or measurement (`cc100-runtime/src/runtime/configuration/validation.ts`, `cc100-runtime/src/runtime/configuration/configuration.ts`).
- Output routing cannot change while an output is on (`cc100-runtime/src/outputs/controller.ts` `assertConfigurationSafe`).
- The editor validates the same rules before publishing (`backend/configuration/editor.ts` `validateEditorSnapshot`).
- New limits refuse configurations over 1 MiB, nested deeper than 16 levels, with IDs over 256 characters or control characters, more than 2048 channels or points, more than 256 enabled channels, or a worst-case status report over 64 KiB (`shared/configuration-limits.ts`). They apply to new revisions and rollbacks in the editor, the API and the runtime. The runtime skips them only when the incoming revision and hash equal its saved accepted configuration, so a running or redelivered configuration is never rejected for them (`cc100-runtime/src/runtime/configuration/configuration.ts`).

**Gaps**

| Gap                                                                                                                                                                                                                                                                                                                            | Tag                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| No size, depth, ID or count limits on configurations.                                                                                                                                                                                                                                                                          | fixed here                                                                                                                         |
| The runtime accepts any desired configuration whose hash matches its content; there is no signature over a revision. Because the controller's own account may publish on its desired topic (section 2), its credential alone is enough to install a retained configuration on it.                                              | reported for ATT-1057                                                                                                              |
| A replacement or reset controller has no saved accepted configuration. A retained revision published before these limits that exceeds them (for example two built-in 879-3020 meters with 131 points and 131 channels each) is therefore rejected with `configuration_limit_exceeded`. Controllers already running it keep it. | accepted risk (reduce the configuration and publish a new revision, [runbook 4](wago-recovery-runbooks.md#4-replace-a-controller)) |
| A rollback publishes an old revision unchanged; its review is the operator's responsibility.                                                                                                                                                                                                                                   | accepted risk                                                                                                                      |

## 5. Commands

**Assets:** the physical outputs.

**Trust boundaries:** B1, B2, B3.

**Threats:** replayed or expired commands; commands against a stale configuration; flooding to starve the
output queue; a slow output blocking others; commands bypassing guards or manual front-panel control.

**Current protections**

- Commands carry an `id`, an `expiresAt` and the `expectedConfigurationRevision`; expired, duplicate and stale-revision commands are rejected and de-duplicated across restarts (`cc100-runtime/src/runtime/commands/commands.ts`).
- Guards, feedback, pulse limits and disconnect policies are enforced on the controller, not only in the UI.
- Writes are serialised per channel with a bounded queue (`queue_full`).
- Commands above 64 KiB are dropped unparsed; a command releases its handling slot when it joins its channel queue, so one slow output cannot hold the other 99 slots (`cc100-runtime/src/runtime/commands/commands.ts`, `cc100-runtime/src/transport/admission.ts`).
- A dropped command gets no reply. The server's command timeout fires exactly as for an offline controller.

**Gaps**

| Gap                                                                                                                                                                                                                      | Tag                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Unbounded command payloads and concurrency on the controller.                                                                                                                                                            | fixed here                                                               |
| Anyone who may publish on the controller's command topic can command it: the server's broker account and, because of its `#` publish grant, the controller's own account (section 2). There is no per-command signature. | reported for ATT-1057                                                    |
| Runtime admission is strictly first come, first served. Under a flood, output-off commands and the runtime-update failsafe message (on the desired-configuration topic) are dropped like any other message.              | accepted risk (fallback: the disconnect policies and command timeouts)   |
| Dropped commands are indistinguishable from an offline controller to the caller.                                                                                                                                         | accepted risk (counts are visible in diagnostics)                        |
| Software commands are not a safety function; there is no certified safe-torque or emergency-stop path.                                                                                                                   | accepted risk (documented in [safety boundary](wago-safety-boundary.md)) |

## 6. Plugin boundaries

**Assets:** the host database and secrets, other plugins' data, the shared MQTT connections.

**Trust boundaries:** B4.

**Threats:** the plugin reads another plugin's secrets; the plugin reaches host internals; another plugin
reads WAGO secrets; a plugin sends more than it declared.

**Current protections**

- Declared permissions (`plugin.json`: `DATABASE_ACCESS`, `ACCESS_MQTT_SERVERS`, `TRIGGER_FLOWS`, `MANAGE_SECRETS`) are enforced by the host's guarded context.
- Plugin secrets are encrypted with a key derived per plugin ID from the server secret (`apps/api/src/encryption/encryption.service.ts` `getPluginEncryptionKey`).
- A lint rule and a module-boundary script keep the plugin from importing host internals or other plugins (`@nx/enforce-module-boundaries`, `scripts/lint-module-boundaries.mjs`).

**Gaps**

| Gap                                                                                                         | Tag                                                         |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The MQTT context is shared by all plugins with `ACCESS_MQTT_SERVERS`; there is no per-plugin topic scoping. | reported for ATT-1057                                       |
| A host-wide message-size cap does not exist.                                                                | accepted risk (recorded non-goal; broker limit recommended) |

## Pen-test brief

**Goal:** find ways to move an output without being authorised, to deny service to the server or controller with
input, or to read or alter another party's secrets.

**In scope**

- Controller-originated MQTT on every topic in sections 1 to 3 against a test Attraccess server.
- Server-originated MQTT against the controller runtime (commands, desired configuration, claims, rotation).
- The plugin HTTP API for configuration, commands, commissioning and credential rotation.
- The simulator runtime ([simulator README](https://github.com/Attraccess/Attraccess/blob/main/apps/plugins/wago/cc100-runtime/README.simulator.md)); no physical controller is required.

**Out of scope:** the broker software itself, the Attraccess host outside the plugin, physical attacks on a CC100,
and denial of service that only saturates network bandwidth.

**Entry points to attack**

| Entry point                                                                             | Direction            | Limit to try to break                               |
| --------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `attraccess/wago/discovery/<hardwareId>`                                                | controller to server | 64 KiB, 8 levels                                    |
| `.../controllers/<id>/heartbeat`, `state`, `measurements`, `faults`, `acknowledgements` | controller to server | 64 KiB, 8 levels                                    |
| `.../controllers/<id>/configuration/reported`                                           | controller to server | 64 KiB, 8 levels                                    |
| `.../discovery/<id>/claim/ack`, `.../credentials/rotate/ack`                            | controller to server | 64 KiB, 8 levels                                    |
| `.../controllers/<id>/credentials/rotate/ack` while a network change is verified        | controller to server | 1 KiB                                               |
| `.../controllers/<id>/commands`                                                         | server to controller | 64 KiB, 100 at once                                 |
| `.../controllers/<id>/configuration/desired`                                            | server to controller | 1 MiB, config limits, decoded under the update lock |
| `.../discovery/<id>/claim`, `.../credentials/rotate`                                    | server to controller | 64 KiB                                              |

**Fixtures and accounts the tester needs**

- A disposable Attraccess instance with the WAGO plugin installed, an admin account, and a second account without WAGO permissions.
- A dedicated RabbitMQ 4 broker (or the reliability harness broker) with an administrative account for the tester, and one low-privilege account per simulated controller created by the normal enrollment flow.
- At least two simulated controllers (`cc100-runtime/docker-compose.simulator.yml`) so cross-controller impersonation can be tried.
- The pairing code and fingerprint of one unclaimed controller; none of a claimed one.
- No physical CC100 and no production broker.

**Test cases to include**

- With one controller's own credential, publish on that controller's `commands`, retained `configuration/desired`
  (with a self-computed hash) and `credentials/rotate` topics. Expected today: accepted by the controller (known gap,
  reported for ATT-1057). Also try the same on another controller's topics. Expected: refused by the broker.
- With that credential, flood the controller's own command subscription and check that a server command, including
  output-off, is dropped as `overload` and times out (accepted risk, section 5).
- Send payloads just over each limit in the entry-point table, and nesting of 9 levels, and check they are ignored
  without decoding.

**Report back:** each finding with the topic or endpoint, payload, observed effect and the limit it bypasses.
Findings that need baseline hardening are filed against ATT-1057.
