# Bluetooth Transport for Plugins

<!-- llms-description: Describes the BLE transport contract that backend plugins use to talk to Bluetooth devices through Attractap readers: profiles, endpoints, sessions, errors, limits and testing with the fake. -->

Backend plugins with the `BLE_TRANSPORT` permission can talk to Bluetooth Low Energy (BLE) devices through Attractap readers. The transport is deliberately **not** a raw GATT API: every operation goes through a profile your plugin registered and an endpoint your plugin owns. Core enforces the boundaries; your plugin supplies the vendor semantics.

> [!NOTE]
> Readers need Attractap firmware **2.5.0 or later** for plugin Bluetooth. On older firmware `scan` and `openSession` reject with `READER_UNSUPPORTED`. `TRANSPORT_UNAVAILABLE` only occurs on hosts that run without the reader transport (for example a test host); do not retry it in a tight loop.

## Trust boundary

| Your plugin owns                             | Core owns                                                             |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Parsing advertisements and choosing a device | Which readers plugins may use (an administrator opt-in per reader)    |
| Credentials, keys and the command protocol   | Device identity: the address a plugin may talk to is bound to it      |
| What a read, write or notification means     | The profile: only registered services, characteristics and operations |
| Deciding when to connect and when to give up | Payload bounds, deadlines, session leases and cancellation            |
| Deleting the endpoints it no longer needs    | Ownership (plugins never see each other's endpoints) and cleanup      |

Enforcement always runs in the host. The validation helpers are exported from the SDK so the fake behaves identically, but a plugin cannot skip them.

Plugin Bluetooth works only on [paired readers](attractap/pairing.md), which talk to the server over the encrypted reader link. The reader firmware refuses BLE commands on the older token-based connection and before the reader has signed in; the host reports such a reader as `READER_OFFLINE` with detail `pairing-required`.

> [!IMPORTANT]
> The radio link between the reader and the device has **no Bluetooth-level security**. The reader firmware is built without BLE security (`CONFIG_BT_NIMBLE_SECURITY_ENABLE` is off): it never pairs or bonds with a device, and the BLE link is not encrypted. Anyone in radio range can record the traffic. If payloads are sensitive (user codes, keys, unlock commands), your plugin must encrypt and authenticate them itself, for example with the device's own protocol security.

Administrators stay in control: a reader is closed to plugins by default. An administrator enables **Allow plugins to use Bluetooth** in the reader editor (General tab). Turning it off ends all plugin BLE sessions on that reader immediately; existing endpoints stay, but scans, new endpoints and sessions fail with `READER_ACCESS_DENIED`.

> [!WARNING]
> `BLE_TRANSPORT` does not fence off the escape hatches of other permissions. `DATABASE_ACCESS` bypasses ownership because it reads every table, and `RESOLVE_HOST_PROVIDERS` (`context.get`) can reach internal host services. Only install plugins you trust with those permissions, and never use them to read or change the `plugin_ble_endpoint` rows: use `context.ble` instead. Never use `context.get` to reach the BLE transport either: that skips every check on this page.

## Lifecycle

`context.ble` is available when the plugin declares `BLE_TRANSPORT`; without it the getter throws `PluginPermissionError`. The property is optional in the type so a plugin still type-checks against hosts that predate it.

```ts
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';

const plugin: PluginBackendModule = {
  register(context) {
    const ble = context.ble;
    if (!ble) throw new Error('This plugin needs a host with BLE transport support');
    ble.registerProfile({/* ... */});
    return { module: MyModule };
  },
};
```

The examples below use this `ble`.

- **`registerProfile` is synchronous.** It needs no host service, so you may call it from `register(context)`, a provider constructor or module scope, in any plugin load order.
- **Every other method is asynchronous and never throws synchronously.** Called before the host finished bootstrapping, it rejects with `PluginBleError('NOT_READY')` (retryable). It never waits. Call it from a lifecycle hook, a request handler or an event handler, or retry on `NOT_READY`.
- **The host builds your plugin twice.** At start-up a throwaway configuration app loads your plugin modules and is closed again, then the real application loads them. Your registrations run in both. Registering an identical definition again is idempotent, so this works without any code on your side. Registering a _different_ definition under an existing id throws `PROFILE_CONFLICT` and your plugin fails to load.
- Profiles are kept in memory per plugin id. Endpoints are stored by core in its database and survive restarts. After a restart an endpoint whose profile your plugin has not registered (yet) can be listed, updated and deleted, but opening a session fails with `PROFILE_NOT_REGISTERED`.
- **A profile cannot change while the API runs.** Once registered, a profile id keeps its definition until the API restarts (installing or updating plugins restarts it). A plugin that builds a profile from its settings gets `PROFILE_CONFLICT` after a settings change until the next restart.
- **Profiles have no version.** When a plugin update changes a profile under the same id, existing endpoints are interpreted with the new definition. Use a new profile id for incompatible changes.

## Profiles

A profile is immutable and lists exactly what your plugin may do with a kind of device.

```ts
const profile = ble.registerProfile({
  id: 'door-lock', // /^[a-z0-9][a-z0-9-]{0,63}$/, unique per plugin
  advertisement: { serviceUuids: ['fff0'], namePrefix: 'Lock' }, // optional; needed to scan
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 20 },
        { key: 'status', uuid: 'fff2', operations: ['read', 'notify'], maxReadBytes: 4, maxNotificationBytes: 20 },
        { key: 'firmware', uuid: 'fff3', operations: ['writeWithoutResponse'], maxWriteBytes: 244 },
      ],
    },
  ],
  limits: { maxSessionMs: 120_000, maxNotificationQueue: 64 },
});
```

- **UUIDs** may be 16-bit (`"180f"`), 32-bit or 128-bit. They are normalized to lowercase 128-bit with dashes. Malformed or duplicate UUIDs are rejected.
- **Keys** (`/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/`) are profile-local names. **Operations always name a characteristic by key, never by UUID.** An unknown key rejects with `UNKNOWN_CHARACTERISTIC`.
- **Operations** are a non-empty list without duplicates from `read`, `write`, `writeWithoutResponse`, `notify`, `indicate`. Using an operation a key does not allow rejects with `OPERATION_NOT_ALLOWED`.
- **List order does not matter.** `registerProfile` sorts `operations` and the advertisement filter lists into a canonical order, so registering the same definition with the lists in another order is idempotent.
- **Bounds** (`maxReadBytes`, `maxWriteBytes`, `maxNotificationBytes`, 1..512) are required for every allowed operation. A bound you set for an operation the key does not allow must still be within 1..512. A write above its bound rejects with `PAYLOAD_TOO_LARGE` **before** anything reaches the reader. A read result above its bound also rejects with `PAYLOAD_TOO_LARGE`; a notification above its bound fails its stream (see [Sessions](#sessions)).
- **`advertisement`** filters scans: a scan returns only advertisements that match every criterion you set (any listed service UUID, any listed manufacturer id from 0 to 0xffff, and the name prefix). A filter must set at least one of the three, otherwise `INVALID_PROFILE`. A profile without an advertisement filter cannot scan (`OPERATION_NOT_ALLOWED`).
- **`limits`** set the session lease cap (`maxSessionMs`, 1 ms up to 15 minutes, default 30 s; the default lease is 30 s or `maxSessionMs` if that is lower) and the notification queue up to 256 (`maxNotificationQueue`, default 32). Because `maxSessionMs` defaults to 30 s, a `leaseMs` above 30 s needs `limits.maxSessionMs` in the profile. Values above the host caps are rejected with `INVALID_PROFILE`.

The returned profile is deep-frozen. Invalid definitions throw `PluginBleError('INVALID_PROFILE')` with a message that names the field, for example `services[0].characteristics[1].maxReadBytes: is required for the allowed operations`.

## Readers and scanning

```ts
const readers = await ble.listReaders();
// [{ readerId: 3, name: 'Workshop door', available: true }]

const advertisements = await ble.scan(readers[0].readerId, 'door-lock', {
  durationMs: 5000, // default 5 s, max 15 s
  signal,
});
// [{ address: 'AA:BB:CC:DD:EE:01', addressType: 'public', rssi: -48, name: 'Lock 12',
//    serviceUuids: ['0000fff0-...'], manufacturerData: [{ companyId: 0x1234, data: Uint8Array }] }]
```

`listReaders` returns only readers an administrator opened for plugins. `available` is true while the reader is online and its firmware supports plugin Bluetooth. It is false when the host has no transport driver, the reader is offline, or its firmware is too old. A reader that is busy with another plugin's session stays `available`.

A reader runs **one BLE job at a time**: one scan or one session, for all plugins together. A `scan` or `openSession` while another scan or session uses the reader rejects at once with `READER_BUSY` (retryable). Nothing is queued. A scan returns at most 32 advertisements, deduplicated by address (on the reader and again in the host).

`scan` has a host-side deadline: if the transport does not answer within `durationMs` plus 5 s, it rejects with `TIMEOUT`. Advertisements the reader reports in a malformed form are skipped; they do not fail the scan.

## Endpoints

An endpoint binds one device address on one reader to one of your profiles. Core stores it, and exactly one plugin owns it.

```ts
const endpoint = await ble.createEndpoint({
  readerId: 3,
  address: 'aa:bb:cc:dd:ee:01', // normalized to AA:BB:CC:DD:EE:01
  addressType: 'public',
  profileId: 'door-lock',
  label: 'Workshop door', // optional, max 100 characters
});
// endpoint.id is an opaque UUID: store it in your own records.

await ble.listEndpoints(); // your endpoints only
await ble.getEndpoint(endpoint.id);
await ble.updateEndpoint(endpoint.id, { label: null, readerId: 4 }); // profileId is immutable
await ble.deleteEndpoint(endpoint.id);
```

- `profileId` must be registered by **your** plugin, otherwise `PROFILE_NOT_REGISTERED`.
- The reader must exist and be opted in: `READER_NOT_FOUND` or `READER_ACCESS_DENIED`.
- One physical address belongs to at most one plugin; another plugin binding it gets `ENDPOINT_CONFLICT`. One plugin may bind the same address on several readers, but only once per reader.
- Another plugin's endpoint id behaves exactly like a missing one (`ENDPOINT_NOT_FOUND`), so the existence of endpoints never leaks.
- Endpoints are removed when their reader is deleted and when your plugin is uninstalled.

## Sessions

```ts
const result = await ble.withSession(
  endpoint.id,
  async (session) => {
    const events = await session.subscribe('status');
    await session.write('command', Uint8Array.of(0x01));
    const confirmation = await events.next({ timeoutMs: 3000 });
    await session.unsubscribe('status');
    return confirmation.value;
  },
  { leaseMs: 20_000 },
);
```

`openSession(endpointId, { signal, leaseMs, connectTimeoutMs })` returns a session; `withSession` opens one, runs your function and **always closes the session**, also when your function throws or the signal aborts. Prefer it.

| Member                                        | Behaviour                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `endpointId`                            | Identify the session and its endpoint.                                                                                                                                                                                                                              |
| `mtu`                                         | The negotiated ATT MTU (23..517). A write without response carries at most `mtu - 3` bytes; a larger one rejects with `PAYLOAD_TOO_LARGE` (detail `exceeds-mtu`). Writes with response use the long-write procedure up to the profile bound.                        |
| `read(key, { signal, timeoutMs })`            | Reads a characteristic; resolves with a copy of the bytes.                                                                                                                                                                                                          |
| `write(key, value, { withoutResponse, ... })` | Writes. An empty value rejects with `INVALID_ARGUMENT`. `withoutResponse` needs the `writeWithoutResponse` operation; otherwise `write` is required, so a key that allows only `writeWithoutResponse` needs `{ withoutResponse: true }`. Use it for bulk transfers. |
| `subscribe(key, { signal })`                  | Starts notifications (`notify` or `indicate`). Returns a stream with `next({ timeoutMs, signal })`, an async iterator and `unsubscribe()`.                                                                                                                          |
| `unsubscribe(key)`                            | Stops a subscription. Unsubscribing without a subscription does nothing.                                                                                                                                                                                            |
| `close()`                                     | Idempotent. Disconnects and ends the session.                                                                                                                                                                                                                       |
| `closed`                                      | A promise that resolves (never rejects) with `{ reason }` once the session ended and the host finished disconnecting the link.                                                                                                                                      |

Rules:

- **One open session per endpoint.** A second `openSession` rejects with `ENDPOINT_BUSY` (retryable). There is no queue.
- **One session per reader.** A reader holds one BLE connection at a time, for all plugins. While a session or scan uses it, `openSession` and `scan` through that reader reject with `READER_BUSY` (retryable). A long session, such as a firmware update of a device, blocks that reader for every plugin until it ends, so keep sessions as short as the job allows.
- **Writes without response are pipelined.** `write(..., { withoutResponse: true })` resolves once the reader link queued the write in order, not after a round trip, so bulk transfers are fast. If the reader later fails one of them, the next `read`, `write` or `subscribe` your plugin starts on the session rejects with that error's code. If no such operation follows, the failure is only logged when the session closes; your plugin does not learn about it. End a transfer with an operation that has an answer (a write with response, a read, or the device's acknowledgement notification) to know that it arrived. Chunk bulk data to `session.mtu - 3` bytes.
- **Operations run one at a time, in call order.**
- **Notifications** arrive in order per subscription, only to the owning session, in a bounded queue (default 32, profile maximum 256). Consume them promptly. Subscribing to a key that is already subscribed rejects with `INVALID_ARGUMENT`.
- **A failing stream never drops data silently.** When the queue overflows, the host discards the queued notifications and fails the stream at once with `NOTIFICATION_OVERFLOW`. A notification above `maxNotificationBytes` fails the stream the same way with `PAYLOAD_TOO_LARGE`. Every pending and later `next()` then rejects with that code, while the session stays open. Call `session.unsubscribe(key)` and subscribe again to resume.
- **How a stream ends.** The async iterator ends quietly when the stream is unsubscribed or the session closes normally (`close()`, lease expiry, revocation, shutdown). It throws when the device disconnects (`DISCONNECTED`), on overflow and on an oversized notification. `stream.unsubscribe()`, like breaking out of `for await`, does nothing once the stream has ended or the session is closed. It only ever tears down that stream, never a newer subscription on the same key.
- **After `close`**, every further operation rejects with `SESSION_CLOSED`. Operations that were pending when the session closed reject immediately, exactly once: `DISCONNECTED` if the device disconnected, `CANCELLED` if the signal passed to `openSession` aborted, `SESSION_CLOSED` otherwise.
- **`closed` waits for the disconnect.** It resolves once the host has finished disconnecting the link (bounded by a host deadline), so opening a new session right after `closed` resolves does not hit `ENDPOINT_BUSY`. After a connect timeout or a cancelled open, the endpoint stays busy (`ENDPOINT_BUSY`, retryable) until the reader's connect attempt has ended, at most 10 s.
- **`closed` reasons:** `closed`, `lease-expired`, `cancelled`, `disconnected`, `reader-access-revoked`, `endpoint-deleted`, `shutdown`, `error`.
- **Cancellation.** `scan`, `openSession`, `withSession`, `read`, `write`, `subscribe` and `next` accept an `AbortSignal`. Aborting rejects that pending call with `CANCELLED`. Aborting the signal you passed to `openSession` closes the session. A timed-out or cancelled operation does **not** close the session, unless the transport reports the link lost. On a real reader the cancellation reaches the reader: a scan stops, a pending connect is cancelled and the reader is released. A read or write the radio has already started cannot be aborted mid-air: your call rejects at once, the reader discards the late result, and the next operation starts when the radio finished.

## Errors

Every failure is a `PluginBleError` with a stable `code`, a `retryable` flag, an optional `operation` and an optional `detail`. `detail` is a safe diagnostic and never contains payload bytes. Permission failures stay `PluginPermissionError`. Input validation errors (`INVALID_PROFILE`, `INVALID_ARGUMENT`) name the offending field in the message. `retryable` means a later attempt can succeed, not that you should retry at once: back off between attempts.

| Code                     | Retryable | Meaning                                                                |
| ------------------------ | --------- | ---------------------------------------------------------------------- |
| `NOT_READY`              | yes       | The host has not finished bootstrapping.                               |
| `TRANSPORT_UNAVAILABLE`  | yes       | The host runs without a reader transport (for example a test host).    |
| `READER_NOT_FOUND`       | no        | The reader does not exist.                                             |
| `READER_ACCESS_DENIED`   | no        | An administrator has not opened the reader for plugins.                |
| `READER_OFFLINE`         | yes       | The reader is not connected or cannot do BLE now.                      |
| `READER_UNSUPPORTED`     | no        | The reader's firmware does not support plugin BLE (`detail` says why). |
| `READER_BUSY`            | yes       | Another scan or session uses the reader, or it updates its firmware.   |
| `PROFILE_NOT_REGISTERED` | no        | Your plugin did not register this profile in this process.             |
| `PROFILE_CONFLICT`       | no        | A different definition is already registered under this id.            |
| `INVALID_PROFILE`        | no        | The profile definition is invalid.                                     |
| `INVALID_ARGUMENT`       | no        | An argument is invalid (the message names the field).                  |
| `ENDPOINT_NOT_FOUND`     | no        | The endpoint does not exist or belongs to another plugin.              |
| `ENDPOINT_CONFLICT`      | no        | The address is already bound (to another plugin, or on this reader).   |
| `ENDPOINT_BUSY`          | yes       | The endpoint already has an open session.                              |
| `UNKNOWN_CHARACTERISTIC` | no        | The key is not in the profile.                                         |
| `OPERATION_NOT_ALLOWED`  | no        | The profile does not allow this operation on the key (or on scanning). |
| `PAYLOAD_TOO_LARGE`      | no        | A payload exceeds its profile bound.                                   |
| `TIMEOUT`                | yes       | A deadline passed.                                                     |
| `CANCELLED`              | no        | The call was cancelled through its `AbortSignal`.                      |
| `SESSION_CLOSED`         | no        | The session is closed.                                                 |
| `DEVICE_NOT_FOUND`       | yes       | The device was not found near the reader.                              |
| `CONNECTION_FAILED`      | yes       | The connection attempt failed.                                         |
| `DISCONNECTED`           | yes       | The device disconnected.                                               |
| `GATT_ERROR`             | no        | The device answered with a GATT error.                                 |
| `NOTIFICATION_OVERFLOW`  | no        | The notification queue overflowed.                                     |
| `INTERNAL`               | no        | An unexpected host error. The message never contains payload data.     |

## Limits and caps

| Limit                                | Default    | Maximum                                               |
| ------------------------------------ | ---------- | ----------------------------------------------------- |
| Operation timeout (`timeoutMs`)      | 10 s       | 60 s                                                  |
| Connect timeout (`connectTimeoutMs`) | 15 s       | 60 s                                                  |
| Session lease (`leaseMs`)            | 30 s       | profile `maxSessionMs` (default 30 s), at most 15 min |
| Scan duration (`durationMs`)         | 5 s        | 15 s                                                  |
| Notification queue per subscription  | 32         | 256 (profile `maxNotificationQueue`)                  |
| Payload per characteristic           | -          | 1..512 bytes, set in the profile                      |
| ATT MTU (`session.mtu`)              | negotiated | 23..517                                               |
| Endpoint label                       | -          | 100 characters                                        |

Values above a cap are rejected with `INVALID_ARGUMENT` (or `INVALID_PROFILE` in a profile); they are never silently clamped. The constants are exported as `PLUGIN_BLE_LIMITS`.

Real readers add these limits:

| Limit                                 | Maximum                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Scan filter (profile `advertisement`) | 8 service UUIDs, 8 manufacturer ids, name prefix of 64 bytes (UTF-8); a larger filter rejects with `INVALID_ARGUMENT`        |
| Characteristics per profile           | 16 (more reject with `READER_UNSUPPORTED`, detail `allowlist-too-large:<n>`)                                                 |
| Requests waiting for one reader       | 16, the lower of the host cap (32) and the limit the firmware announces; more reject with `READER_BUSY`, detail `queue-full` |
| Notification buffer on the reader     | 32 notifications or 16 KiB per session                                                                                       |

An advertised name is at most 31 bytes, so a name prefix longer than that never matches.

## Real readers

The reader firmware (2.5.0 or later) announces plugin Bluetooth when it connects. The host and the reader both enforce the rules:

- **Compatibility.** A reader without the capability, or with a protocol version the host does not support, makes `scan` and `openSession` reject with `READER_UNSUPPORTED`. `detail` is `no-ble-capability`, `protocol-version:<n>` or `missing-operation:<op>`. A profile with more characteristics than the reader accepts (16) rejects with `READER_UNSUPPORTED`, detail `allowlist-too-large:<n>`. Update the reader firmware (OTA from the server) to fix the first case.
- **Enforcement on the reader.** With each session the host sends the reader the profile as an allowlist: the bound address and, per characteristic, the service, the operations and the payload bounds. The reader refuses anything else before it touches the radio. This protects against host bugs, not against a compromised server, which could send any allowlist.
- **Deadlines on the reader.** The reader keeps its own deadlines, so it disconnects the device on its own when the server goes silent:
  - Each operation has a reader deadline of its `timeoutMs` plus 2 s. An operation that passes it rejects with `TIMEOUT` and the session stays open, as on the host.
  - The reader ends the session itself only when a GATT operation is stuck in the radio stack (about 35 s) or when the reader's lease expires (your lease plus 10 s, counted from when the connection was established).
  - When the reader loses its connection to the server, it disconnects the device at once.
- **Bytes from the reader** are checked before the host decodes them. A read result above its bound rejects with `PAYLOAD_TOO_LARGE` (detail `max-read`); a malformed one (bad encoding or no value) rejects with `INTERNAL` (detail `malformed-result`).
- **Notifications** are buffered on the reader (32 notifications or 16 KiB per session) and forwarded in order with a sequence number. Each failure fails the stream:
  - a full reader buffer: `NOTIFICATION_OVERFLOW` (detail `reader-buffer`); a full host queue for the subscription: `NOTIFICATION_OVERFLOW`;
  - a notification above `maxNotificationBytes`: `PAYLOAD_TOO_LARGE` (detail `max-notification`);
  - a gap or duplicate in the sequence, or a malformed notification: `INTERNAL` (detail `malformed-notification`).

  Nothing is dropped silently.

- **Diagnostics.** Radio failures map to the codes above; `detail` carries the raw reason as safe text, for example `nimble:rc=13`, `hci:0x3e`, `att:0x0a` or `reason:0x08`. `READER_OFFLINE` has these details:
  - `pairing-required`: the reader is not paired (see [Trust boundary](#trust-boundary)). Pair it.
  - `firmware-info-pending`: the reader connected but has not announced its firmware yet. Retry after a moment.
  - `ble-init-failed`: the reader could not start its Bluetooth stack. Restart the reader if the error persists.
  - no detail: the reader is not connected.
- **Latency.** Every operation you await travels from the server to the reader and back, typically 0.2 to 0.3 s over Wi-Fi. A protocol that waits for an acknowledgement after every chunk is limited by that round trip (measured: about 1.8 KiB/s with 512-byte chunks). Send bulk data as pipelined writes without response, or in larger windows between acknowledgements.
- **Cancelling on the reader.** A cancelled `scan` or `openSession` rejects at once, but the reader stays busy until it answered the cancelled request (the cancel itself has no answer), usually one round trip (0.2 to 0.3 s). A `scan` or `openSession` in that window rejects with `READER_BUSY` (retryable); retry after a short pause.
- **Firmware updates.** A reader that starts a firmware update ends its BLE session (`disconnected`) and refuses new BLE work with `READER_BUSY` (detail `ota`) until it restarted.

## Cleanup obligations

Your plugin should:

- Use `withSession`, or close every session you open in a `finally` block.
- Unsubscribe streams you no longer read, and handle `closed` to learn why a session ended.
- Delete endpoints you no longer need (for example when the user removes the lock in your plugin).
- **Never log payload bytes, keys or credentials.** Log operation names and outcomes.
- Keep session leases short. Long leases are for long transfers, such as firmware updates.

The host cleans up for you:

| Event                                                                                                          | What happens                                                            |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Your plugin module is destroyed                                                                                | Its sessions close with `shutdown`. Endpoints stay.                     |
| An administrator turns off **Allow plugins to use Bluetooth** on the reader                                    | Its sessions close with `reader-access-revoked`. Endpoints stay.        |
| A reader is deleted                                                                                            | Sessions close with `reader-access-revoked`; its endpoints are deleted. |
| An endpoint is deleted, or its reader, address or address type changes (a label-only update keeps the session) | Its session closes with `endpoint-deleted`.                             |
| A lease expires                                                                                                | The session closes with `lease-expired`.                                |
| Your plugin is uninstalled                                                                                     | Its endpoints are deleted.                                              |

Every close aborts pending operations and subscriptions, tells the transport to disconnect and settles each pending promise exactly once.

## Testing with the fake

`createFakeBleHost` is a deterministic fake of the host. It has no Nest, database or network dependency, uses the same validation, error codes and close reasons as the host, and moves time only when you call `advance`. Several plugins can share one fake host, so you can test cross-plugin behaviour.

```ts
import { createFakeBleHost } from '@attraccess/plugins-backend-sdk';

it('unlocks and waits for the confirmation', async () => {
  const host = createFakeBleHost();
  host.addReader({ readerId: 1, name: 'Door reader', allowPluginBle: true });
  host.addPeripheral({
    readerId: 1,
    address: 'AA:BB:CC:00:00:01',
    addressType: 'public',
    advertisement: { name: 'Lock 1', serviceUuids: ['fff0'] },
    characteristics: {
      fff1: { onWrite: () => host.notify('AA:BB:CC:00:00:01', 'fff2', Uint8Array.of(2)) },
      fff2: { value: Uint8Array.of(1) },
    },
  });

  const ble = host.contextFor('my-plugin');
  ble.registerProfile({
    id: 'door-lock',
    advertisement: { serviceUuids: ['fff0'] },
    services: [
      {
        uuid: 'fff0',
        characteristics: [
          { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 20 },
          { key: 'status', uuid: 'fff2', operations: ['read', 'notify'], maxReadBytes: 4, maxNotificationBytes: 20 },
        ],
      },
    ],
  });
  const [found] = await ble.scan(1, 'door-lock');
  const endpoint = await ble.createEndpoint({
    readerId: 1,
    address: found.address,
    addressType: found.addressType,
    profileId: 'door-lock',
  });

  const confirmation = await ble.withSession(endpoint.id, async (session) => {
    const events = await session.subscribe('status');
    await session.write('command', Uint8Array.of(1));
    const first = (await events.next()).value[0];
    await session.unsubscribe('status');
    return first;
  });

  expect(confirmation).toBe(2);
  expect(host.transcript.map((entry) => entry.op)).toEqual([
    'scan',
    'connect',
    'subscribe',
    'write',
    'unsubscribe',
    'disconnect',
  ]);
});
```

Control surface of the fake host:

| Member                                              | Purpose                                                                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contextFor(pluginId)`                              | A `PluginBleContext` for one plugin.                                                                                                                                                      |
| `addReader(reader)`, `setReaderAccess(id, allowed)` | Readers (`readerId`, `name`, `allowPluginBle?`, `available?`) and the administrator opt-in (default off).                                                                                 |
| `removeReader(id)`                                  | Deletes a reader: sessions close with `reader-access-revoked`, its endpoints are deleted.                                                                                                 |
| `setReaderAvailable(id, available)`                 | `false`: scans and sessions on the reader fail with `READER_OFFLINE`.                                                                                                                     |
| `setTransportAvailable(available)`                  | `false`: a host without a transport (`TRANSPORT_UNAVAILABLE`).                                                                                                                            |
| `setReaderSupported(id, supported, detail?)`        | `false`: reader firmware without plugin BLE; scans and sessions fail with `READER_UNSUPPORTED` and `detail` (default `no-ble-capability`).                                                |
| `setMtu(mtu)`                                       | The ATT MTU of connections opened from now on (default 247, also settable as `createFakeBleHost({ mtu })`).                                                                               |
| `addPeripheral(peripheral)`                         | A device: `readerId` or `readerIds`, `address`, `addressType`, `advertisement`, `characteristics`. Characteristics are keyed by UUID and take `value`, `onRead`, `onWrite` and `delayMs`. |
| `notify(address, uuid, bytes)`                      | The device sends a notification.                                                                                                                                                          |
| `disconnect(address)`                               | The device drops the link: sessions close with `disconnected`.                                                                                                                            |
| `failNext(op, code, { detail })`                    | The next `scan`, `connect`, `read`, `write`, `subscribe`, `unsubscribe` or `disconnect` fails.                                                                                            |
| `advance(ms)`                                       | Moves the manual clock: fires timeouts and lease expiry. No real timers are used.                                                                                                         |
| `transcript`, `openSessions()`                      | Every validated primitive that reached the transport, in order, and the open sessions.                                                                                                    |
| `createFakeBleHost({ ready })`, `setReady(ready)`   | Simulate calls before bootstrap (`NOT_READY`).                                                                                                                                            |
| `createFakeBleHost({ startTime })`                  | Wall-clock start of the fake clock in ms (default 2026-01-01T00:00:00Z).                                                                                                                  |
| `shutdownPlugin(pluginId)`                          | The plugin module is destroyed: its sessions close with `shutdown`.                                                                                                                       |
| `uninstallPlugin(pluginId)`                         | The plugin is uninstalled: its sessions close, its endpoints are deleted.                                                                                                                 |

To test a timeout, give a characteristic a `delayMs` longer than the timeout, start the call, then `await host.advance(timeoutMs)`.

## The fake and real readers

The fake and the host share the same validation and are checked by one contract test suite, which runs against the fake, against the host with a test driver, and against the host with the real reader driver talking to a simulated reader. A plugin that passes its tests against the fake behaves the same on a real reader; there, an administrator enables **Allow plugins to use Bluetooth** on a reader that runs firmware 2.5.0 or later.
