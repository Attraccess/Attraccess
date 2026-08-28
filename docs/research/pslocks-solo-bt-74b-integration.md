# PS Locks SOLO BT 74B+ integration research

Research date: 2026-08-28

## Executive summary

The SOLO BT can be integrated without reverse engineering. PS Locks publishes both the BLE GATT protocol and a July 2024 reference SDK. The lock is a BLE peripheral; a phone, gateway, or Attractap Reader acts as the BLE central and sends authenticated commands directly to it. The documented interface supports timed unlock, continuous unlock, status, configuration, and history. It does not require the PS Locks cloud.

The options, in recommended order, are:

| Option | Attraccess changes | Additional hardware | Recommendation |
|---|---:|---:|---|
| Existing third-party BLE gateway with an HTTP/MQTT API | None or flow configuration only | Yes | Lowest Attraccess engineering effort, but only if the gateway exposes a suitable supported API |
| Dedicated Attraccess BLE-to-MQTT/HTTP bridge | None in the first version | Yes | Lowest product risk; isolates BLE from the reader and uses existing resource flows |
| Attractap Reader as a server-controlled BLE proxy | Small generic firmware service plus moderate backend work | No | Preferred integrated design when the reader has reliable server connectivity |
| Attractap Reader as an autonomous BLE controller | Moderate firmware and backend work | No | Feasible, but puts vendor logic and credentials on every reader unnecessarily |
| Reader performs BLE after the existing door request succeeds | Firmware only | No | Suitable only for a pilot because the backend cannot know whether the physical operation succeeded |
| Wired control | Hardware-dependent | Usually a relay/driver | The battery-operated SOLO BT has no documented direct control input; separate SOLO 3 V/12 V and SOLO SECONDARY products do |

**Recommendation:** buy two exact production units and first prove encrypted BLE control from an ESP32-S3 development board. For a small deployment or fastest delivery, use a dedicated bridge and Attraccess's existing acknowledged MQTT/HTTP flow nodes. If removing the extra box is valuable, make the Attractap Reader a constrained BLE-to-websocket proxy and keep the PS Locks protocol implementation on the Attraccess server. Do not implement the firmware-only, post-success shortcut as the production architecture because it produces incorrect audit and failure semantics.

## Product identity needs confirmation

PS Locks' current public product page calls the Bluetooth product `SOLO BT` and the hinged-door/drawer strike `LATCH74`. It does not decode the ordering suffix `74B+`. The page also presents RFID and Bluetooth as different SOLO variants, while the protocol document covers DUAL firmware with both subsystems. Before designing around a quoted `SOLO BT 74B+`, PS Locks should confirm in writing:

- Full order code, hardware revision, and production firmware version.
- Whether `74` means that the package includes LATCH74.
- Meaning of `B+` and whether it selects BOLT mode, newer encrypted firmware, door sensing, or another option.
- Whether the unit is Bluetooth-only or contains the optional 13.56 MHz RFID hardware.
- Whether its firmware is compatible with the published API and July 2024 SDK.
- Whether it can report both mechanical lock state and door-contact state.

Sources: [SOLO product page](https://pslocks.com/en/solo-electronic-cabinet-lock/), [SOLO data sheet](https://pslocks.com/wp-content/uploads/2024/08/SOLO_Datenblatt_EN_DE.pdf), [API_DUAL_LOCK.pdf](https://pslocks.com/wp-content/uploads/2019/12/API_DUAL_LOCK.pdf).

## Available interfaces

### Direct BLE

This is the normal integration interface for SOLO BT. PS Locks explicitly permits control from an application's own BLE client and publishes the protocol. The documented lock advertises once per second and exposes a custom GATT service:

```text
Service       4d4f4445-5343-4f2d-574f-514b45523232
Unlock       4d4f4445-5343-4f2d-574f-524a45523032
State notify 4d4f4445-5343-4f2d-574f-524a45523038
Crypt token  4d4f4445-5343-4f2d-574f-524a45523043
Crypt unlock 4d4f4445-5343-4f2d-574f-524a45523044
```

The protocol documents:

- Timed unlock using `UNLOCK_NORMAL` (`0x31`).
- Continuous unlock using the deprecated `UNLOCK_BOLT` command (`0x32`).
- User/admin authentication without moving the lock.
- Battery, lock, door, mode, firmware, and history state.
- Configuration including name, automatic relock time, alarm behavior, BLE/RFID enablement, and credentials.
- Up to 100 history entries and, on compatible DUAL hardware, up to 100 RFID whitelist entries.

The document says `UNLOCK_NORMAL` behaves as continuous/BOLT unlock when the lock itself is configured in BOLT mode. The exact mapping of Attraccess `lock`, `unlock`, and `unlatch` must therefore be tested against the purchased `B+` unit. Timed unlock is a natural match for `unlatch`. A deterministic explicit `lock` command is less clear in the published command table than unlock and may depend on BOLT mode/state.

Source: [API_DUAL_LOCK.pdf](https://pslocks.com/wp-content/uploads/2019/12/API_DUAL_LOCK.pdf), especially the GATT table and Unlock/Crypt_Unlock sections.

### Published SDK

The archive at [www.pslocks.com/SDK.zip](https://www.pslocks.com/SDK.zip) currently contains:

- Android SDK source, Kotlin, compile SDK 34, minimum Android 21.
- An iOS XCFramework binary.

The Android implementation is useful as executable protocol documentation. It scans, connects by MAC address, writes date/name-or-number/device ID for history, and chooses plaintext `Unlock` or encrypted `Crypt_Unlock` based on the advertised crypt-mode flag. It exposes unlock, history, and administration operations. It is not directly usable on ESP-IDF because it depends on Android Bluetooth, Kotlin coroutines, Juul Labs Able, AndroidX, and Signal's Android Argon2 library.

The archive's Android README calls the SDK "still under heavy development" and says distribution is currently by AAR rather than Maven. No license file or license declaration was found in the downloaded archive. Written permission and support/versioning terms should be obtained before copying or porting SDK source into a shipped product. Implementing the separately published wire protocol is cleaner than embedding Android code.

Archive inspected on 2026-08-28: SHA-256 `109cfd41e3274ad1b27679600566e6c0304deb927276499ff1a895b512d9f325`.

### Wired variants

The public product page documents separate wired products:

- `SOLO SECONDARY`: 3 V follower with a control line, `LOW=open`, `HIGH=close`; it can be controlled by another microprocessor.
- `SOLO 3 V`: separate open and close wires.
- `SOLO 12 V`: 8-16 V supply, separate open and close wires, optional door-closed contact.

It does not document those control wires on the normal battery SOLO BT. If procurement flexibility exists and Bluetooth adds no useful value, the 12 V product plus a proper isolated driver is operationally simpler. Current Attractap hardware has no dedicated relay/lock output, however, so this still requires hardware changes or an external I/O module.

Source: [SOLO product page](https://pslocks.com/en/solo-electronic-cabinet-lock/).

### Cloud and gateway products

The native PS protocol is local BLE. PS Locks says opening through the API works while the client is within range. No first-party PS cloud API or general-purpose PS gateway was found.

PS lists partner solutions. Boxtronic advertises SOLO Bluetooth locks managed through its cloud, demonstrating that gateway operation is commercially feasible. A partner solution is only a zero-code Attraccess option if it exposes a documented HTTP or MQTT command API with operation acknowledgement. That API was not publicly documented in the sources reviewed, so it must be confirmed commercially; browser automation of a vendor portal is not an acceptable controller integration.

Sources: [PS Locks open interface page](https://pslocks.com/en/open-source/), [PS Locks partner solutions](https://pslocks.com/en/existing-solutions/), [Boxtronic products](https://www.boxtronic.com/products).

## Authentication and security

### Legacy mode

Firmware before 0.11 used a four-digit user code and six-digit admin code sent as ASCII through GATT. Firmware 0.11 retained this as `CRYPT_OFF` for compatibility and the API document says that generation shipped with encryption disabled. The published defaults are user `1234` and administrator `123456`. This mode is unsuitable for production because a nearby BLE sniffer can recover the credential.

### Encrypted mode

In `CRYPT_ON` mode:

1. The client reads a fresh 16-byte token from the lock.
2. The client encrypts that one block with the applicable 128-bit user/admin key using AES-128-ECB.
3. The client writes the 16-byte result plus the requested unlock mode to `Crypt_Unlock`.
4. The lock consumes the token, preventing direct replay.

The July 2024 Android SDK derives the 16-byte key from the human code using Argon2id v1.3 with 32 MiB memory, one lane, three iterations, a 16-byte output, and the fixed ASCII salt `SaltByPSLocks`. That fills in parameters which the 2021 protocol document only recommends generally.

The 32 MiB derivation profile should **not** run on the current Attractap Reader. It exceeds the likely usable RAM budget and would compete with Wi-Fi/TLS, UI, and BLE. In the preferred proxy architecture, the server derives and stores the key and performs the one-block AES response; no lock credential is stored on the reader. An autonomous controller could instead store a pre-derived 16-byte key. It should not derive the key during every operation.

Provisioning requires care. The API document warns that the first admin key used to activate encrypted mode is encrypted with the known all-zero factory key and can be recovered by an observer who records activation. Activate each lock in a controlled RF environment, use unique credentials/derived keys per lock, and never ship defaults.

The present Attractap configuration stores settings in NVS, but its shared configuration does not explicitly enable NVS encryption, flash encryption, or secure boot. A production design must decide how lock keys are protected at rest and whether physical access to the reader is in the threat model.

Sources: [API_DUAL_LOCK.pdf](https://pslocks.com/wp-content/uploads/2019/12/API_DUAL_LOCK.pdf), Android `Hashing.kt`, `Cryptography.kt`, `CryptCodeConverter.kt`, and `PSLocksSdk.kt` from [SDK.zip](https://www.pslocks.com/SDK.zip); Attraccess `apps/attractap/firmware/sdkconfig.defaults` and `src/settings/`.

## Can an Attractap Reader be the Bluetooth proxy or controller?

### Feasibility

Yes. Current readers use ESP32-S3 and ESP-IDF 6.0.2. ESP32-S3 supports BLE central/GATT-client operation, and the PS protocol only needs scanning, one connection, characteristic reads/writes, and notifications. BLE uses the on-chip radio and no additional GPIO. The reader can either interpret the PS protocol itself or expose those BLE operations to the server.

BLE is not currently enabled in the firmware. `apps/attractap/firmware/sdkconfig.defaults` has no Bluetooth configuration and `main/CMakeLists.txt` does not depend on the ESP-IDF Bluetooth component. There is also no generic local actuator abstraction. This is feasible work, not configuration-only work.

### Recommended split: server logic, reader transport

The reader does not need to contain the PS Locks state machine. A better division is:

**Reader responsibilities:**

- Scan for an allowlisted service or connect to a configured BLE address.
- Open and close one BLE connection.
- Discover or cache the required GATT service and characteristics.
- Read, write, subscribe, and forward notifications.
- Enforce operation deadlines and report transport/controller errors.
- Correlate every response and notification with a server-assigned session and request ID.

**Server responsibilities:**

- Map an Attraccess resource to a lock and nearby reader.
- Store lock metadata and credentials in server-side protected storage.
- Implement PS Locks advertisement parsing and the documented GATT state machine.
- Derive keys during provisioning and perform AES challenge-response during access.
- Send history metadata such as date, actor label, and operation UUID.
- Decide retries, timeout policy, expected state transition, and final success.
- Record audit and expose battery, door, and lock health.

This makes the firmware vendor-neutral and keeps changeable protocol logic in the server, where it is easier to test and deploy. It also avoids distributing lock secrets to readers. The tradeoff is that each BLE transaction depends on the websocket connection and incurs a server round trip. That is acceptable for an online Attraccess reader if the command API is asynchronous and time-bounded.

A completely unrestricted remote GATT API would turn a compromised server connection into arbitrary access to nearby BLE devices. The proxy should therefore be constrained to provisioned device addresses and/or explicit service and characteristic UUID allowlists. It should permit only one active proxy session and bounded payload sizes.

### Reader BLE transport implementation

Use ESP-IDF NimBLE in central-only mode:

- One connection and one operation at a time.
- Fixed provisioned lock address after initial discovery.
- Short, bounded scans rather than continuous scanning.
- A dedicated asynchronous BLE task and command queue; never block websocket, NFC, or display callbacks.
- Forward reads, write completions, notifications, disconnects, and controller errors with correlation IDs.
- Do not store PS lock credentials or implement Argon2/AES in firmware in proxy mode.
- Pause or reject BLE operations during reader OTA.
- Report transport diagnostics such as RSSI, GATT status, disconnect reason, and timeout; the server interprets vendor payloads.

### Backend protocol changes

The existing reader websocket ACK confirms receipt, not physical completion. Its pending ACK lookup is keyed by reader and event type rather than a unique physical-operation ID. A dumb proxy needs request/response events resembling:

```text
BLE_SESSION_OPEN   { sessionId, requestId, address, serviceUuid, timeoutMs }
BLE_GATT_READ      { sessionId, requestId, characteristicUuid }
BLE_GATT_WRITE     { sessionId, requestId, characteristicUuid, value }
BLE_GATT_SUBSCRIBE { sessionId, requestId, characteristicUuid }
BLE_SESSION_CLOSE  { sessionId, requestId }

BLE_PROXY_RESULT       { sessionId, requestId, success, value, error }
BLE_PROXY_NOTIFICATION { sessionId, characteristicUuid, value }
BLE_PROXY_DISCONNECTED { sessionId, reason }
```

The server's PS Locks service sequences these primitives: connect, optionally write audit metadata, read `Crypt_Token`, calculate the AES response, subscribe to state, write `Crypt_Unlock`, verify the notification/state, and disconnect. The backend should report door success only after that state machine reaches semantic completion. This preserves accurate audit and existing flow failure behavior. It also supports actions originating from the web/API, not only a card presented at that reader.

Transport receipt ACKs and BLE operation results must remain separate. `requestId` correlates each GATT primitive; `sessionId` scopes notifications and rejects stale responses after reconnect. The server should have an overall physical-operation ID above both of them.

Likely code areas:

- Firmware generic BLE proxy service: new code under `apps/attractap/firmware/src/`, plus `bt`/NimBLE build configuration.
- Firmware event dispatch: `apps/attractap/firmware/src/api/api.cpp`.
- Backend event types: `apps/api/src/attractap/websockets/websocket.types.ts`.
- Backend command/result correlation: `apps/api/src/attractap/websockets/`.
- Backend PS Locks protocol service: a small new service with protocol fixtures/tests derived from the published API and SDK.
- Door operation integration: `apps/api/src/attractap/websockets/handlers/session.handler.ts` and/or the resource flow executor.
- Provisioning and resource/reader/lock mapping: preferably server-side; only radio identity/allowlist data needs to reach the reader.

### Resource risks

- **Internal RAM:** the firmware already has documented internal-heap fragmentation around websocket/TLS task creation. NimBLE must be configured narrowly and measured under reconnect stress.
- **Radio coexistence:** Wi-Fi and BLE share the ESP32-S3 2.4 GHz radio. Avoid continuous active scans and test websocket latency while unlocking. Ethernet variants are the lower-risk first target.
- **RF placement:** the lock sits behind or inside furniture, often metal. Validate the exact reader enclosure and cabinet; do not rely on the nominal phone range.
- **Multiple mappings:** Attraccess permits several readers per resource and several resources per reader. Configuration must designate which reader controls which physical lock and define failover/concurrency behavior.
- **Battery behavior:** advertisements expose battery state, but battery telemetry should also become a maintenance alert. Confirm the purchased unit's configurable low-battery fail-open/fail-closed behavior.

## Minimal-change architectures

### 1. Dedicated BLE bridge through existing flows

```text
Attractap card authentication
  -> Attraccess door authorization
  -> existing HTTP or MQTT flow node
  -> BLE bridge near cabinet
  -> encrypted GATT command
  -> SOLO BT
  -> semantic result returned to the flow
```

This requires no reader change and potentially no Attraccess code change. The existing HTTP and MQTT flow executors support acknowledged completion and propagate failures. The bridge can be placed where RF is best and can have its own small, BLE-focused firmware.

This is the recommended first production architecture unless eliminating the bridge hardware is a strong requirement.

### 2. Attractap as a dumb, correlated BLE proxy

```text
Attractap or web action
  -> Attraccess authorization
  -> server-side PS Locks state machine
  -> websocket GATT primitives to designated reader
  -> reader forwards encrypted GATT bytes unchanged
  -> reader forwards SOLO BT state notification unchanged
  -> server interprets state and completes the operation
  -> Attraccess commits/reports physical result
```

This is the best integrated architecture and avoids another box. The reader firmware remains a generic, constrained BLE transport; all vendor-specific GATT sequencing and cryptography stays in one backend service. Existing NFC authentication, resource authorization, and OTA remain unchanged. Compared with an autonomous reader controller, this reduces firmware churn and secret distribution at the cost of more websocket round trips and no offline lock operation.

### 3. Attractap as autonomous BLE controller

An autonomous variant can expose a high-level `BLE_LOCK_COMMAND` and locally execute the PS Locks protocol. It saves server round trips and could support limited operation during a transient server disconnect, but Attraccess authorization already depends on the server. It therefore brings little practical offline benefit while requiring vendor logic and per-lock secrets in firmware. Keep it as a fallback only if latency measurements show that the dumb proxy cannot meet operation timing.

### 4. Firmware-only local actuation after success

The reader can invoke BLE after the current `LOCK_DOOR`/`UNLOCK_DOOR` response succeeds, avoiding backend protocol work. Do this only in a proof of concept. Attraccess would have recorded success before the reader discovers that the lock is absent, jammed, out of range, or rejected the credential.

## Proposed proof of concept

1. Ask PS Locks to identify the `74B+` suffix and confirm API/SDK compatibility, encrypted-mode support, explicit lock semantics, licensing, and current firmware.
2. Obtain two locks, their LATCH74 hardware, fresh batteries, and model-specific compliance documents.
3. Use the official app/SDK to record advertisement fields, firmware, crypt mode, command timing, notifications, and lock/door state transitions.
4. Activate crypt mode with unique keys in a controlled RF setting.
5. Implement a standalone ESP32-S3 NimBLE transport test and drive its connect/read/write/subscribe operations from a host-side PS Locks state machine.
6. Test through the actual cabinet and reader enclosure, including low battery, jam, open door, reader reboot, lock reboot, rapid repeated access, and two nearby locks.
7. Measure internal heap, largest free block, websocket latency, NFC responsiveness, and Wi-Fi/BLE coexistence on an Attractap development unit.
8. Choose dedicated bridge or integrated reader based on those measurements, then add operation-ID correlation before production rollout.

### Running the ATT-1031 transport prototype

Firmware `1.5.22` contains the temporary raw BLE proxy. The API endpoint requires an authenticated account or API token with `resources.update`; replace the values below with the running API URL, token, connected reader ID, and values returned by the scan:

```bash
export API_URL="http://localhost:3000/api"
export TOKEN="<api-token>"
export READER_ID="<reader-id>"

curl -sS -X POST "$API_URL/attractap/readers/$READER_ID/ble-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operation":"scan","serviceUuid":"4d4f4445-5343-4f2d-574f-514b45523232"}'

export LOCK_ADDRESS="<address-from-scan>"
export LOCK_ADDRESS_TYPE="<addressType-from-scan>"

curl -sS -X POST "$API_URL/attractap/readers/$READER_ID/ble-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"connect\",\"address\":\"$LOCK_ADDRESS\",\"addressType\":$LOCK_ADDRESS_TYPE}"
```

For a lock confirmed to be in legacy `CRYPT_OFF` mode, this writes the documented default user code `1234`, two ASCII zeroes, and `UNLOCK_NORMAL` (`1`). Do not use the default code or plaintext mode outside an isolated proof of concept.

```bash
curl -sS -X POST "$API_URL/attractap/readers/$READER_ID/ble-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operation":"write","serviceUuid":"4d4f4445-5343-4f2d-574f-514b45523232","characteristicUuid":"4d4f4445-5343-4f2d-574f-524a45523032","valueHex":"31323334303031"}'
```

For `CRYPT_ON`, first read the one-time token:

```bash
curl -sS -X POST "$API_URL/attractap/readers/$READER_ID/ble-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operation":"read","serviceUuid":"4d4f4445-5343-4f2d-574f-514b45523232","characteristicUuid":"4d4f4445-5343-4f2d-574f-524a45523043"}'
```

Encrypt the returned 16-byte `valueHex` using AES-128-ECB with the lock's already-derived 16-byte user key, append `31`, and write the result to `Crypt_Unlock`. This transport POC intentionally does not derive or store that key. The production server-side PS Locks service must perform the documented Argon2id derivation during provisioning.

```bash
export TOKEN_HEX="<valueHex-from-read>"
export KEY_HEX="<32-hex-character-derived-user-key>"
export RESPONSE_HEX="$(printf '%s' "$TOKEN_HEX" | xxd -r -p | openssl enc -aes-128-ecb -e -K "$KEY_HEX" -nosalt -nopad | xxd -p -c 256)"

curl -sS -X POST "$API_URL/attractap/readers/$READER_ID/ble-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"operation\":\"write\",\"serviceUuid\":\"4d4f4445-5343-4f2d-574f-514b45523232\",\"characteristicUuid\":\"4d4f4445-5343-4f2d-574f-524a45523044\",\"valueHex\":\"${RESPONSE_HEX}31\"}"
```

Always release the single proxy connection after testing:

```bash
curl -sS -X POST "$API_URL/attractap/readers/$READER_ID/ble-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"operation":"disconnect"}'
```

A successful write only proves GATT acknowledgement. This deliberately minimal prototype has no notification subscription and therefore cannot yet prove the resulting mechanical state; verify movement directly during the bench test.

## Questions for PS Locks

- What exactly does `SOLO BT 74B+` mean, and what firmware ships on it now?
- Is the July 2024 SDK the supported reference for this exact SKU?
- Does the unit ship with `CRYPT_ON`, and can unique 128-bit keys be factory-provisioned securely?
- What command deterministically locks an unlocked `B+` unit, and what notification proves completion?
- Is simultaneous or alternating use by a phone and a fixed BLE central supported?
- Is the BLE MAC stable, and what address type does current hardware use?
- Can we obtain a current protocol document if production firmware is newer than the documented 0.11 generation?
- What license governs `API_DUAL_LOCK.pdf` and `SDK.zip`, and may Attraccess ship an independent implementation?
- Is signed DFU available to integrators, and how are firmware updates and security advisories distributed?
- Can PS provide the exact unit's EU Declaration of Conformity, FCC grant if applicable, and Bluetooth qualification ID?

## Conclusion

The lock is a credible fit for Attraccess-controlled indoor cabinets. The most important favorable fact is that control is a documented local BLE protocol rather than a closed phone-app or cloud dependency. An Attractap Reader can feasibly be a dumb BLE proxy. Forwarding GATT operations is enough at the radio layer, provided the websocket protocol has strict request/session correlation and the server waits for a verified physical result.

For the least code and operational risk, start with a dedicated BLE-to-MQTT/HTTP bridge. If the proof of concept shows acceptable RAM, coexistence, RF, and round-trip timing margins, adding a constrained generic BLE proxy to Attractap Readers is reasonable and removes the extra hardware without moving PS-specific logic into firmware.

## Primary sources

- [PS Locks SOLO product page](https://pslocks.com/en/solo-electronic-cabinet-lock/)
- [PS Locks SOLO data sheet](https://pslocks.com/wp-content/uploads/2024/08/SOLO_Datenblatt_EN_DE.pdf)
- [PS Locks open interface and firmware page](https://pslocks.com/en/open-source/)
- [PS Locks API_DUAL_LOCK protocol](https://pslocks.com/wp-content/uploads/2019/12/API_DUAL_LOCK.pdf), document date 2021-01-19
- [PS Locks SDK archive](https://www.pslocks.com/SDK.zip), Android/iOS archive labelled July 2024
- [PS Locks Bluetooth app instructions](https://pslocks.com/wp-content/uploads/2023/09/Bluetooth_Anleitung_EN-2.pdf)
- [PS Locks partner solutions](https://pslocks.com/en/existing-solutions/)
- [Boxtronic products](https://www.boxtronic.com/products)
- Attraccess firmware and backend source files cited above
