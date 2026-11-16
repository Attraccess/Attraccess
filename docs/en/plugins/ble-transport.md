# Bluetooth transport for plugins

<!-- llms-description: Describes the BLE transport contract that backend plugins use to talk to Bluetooth devices through Attractap readers: profiles, endpoints, sessions, errors, limits and testing with the fake. -->

Backend plugins with the `BLE_TRANSPORT` permission can talk to Bluetooth Low Energy (BLE) devices through Attractap readers. The transport is deliberately **not** a raw GATT API: every operation goes through a profile your plugin registered and an endpoint your plugin owns. Core enforces the boundaries; your plugin supplies the vendor semantics.

> [!NOTE]
> This page defines the contract and ships the SDK types, the permission, endpoint storage, the per-reader opt-in and a deterministic fake for tests. The real reader transport (the websocket protocol and firmware that carry BLE traffic) arrives with ATT-1033. Until then `scan` and `openSession` reject with `TRANSPORT_UNAVAILABLE`, while profiles and endpoints already work and you can test everything against the fake.

## Trust boundary

| Your plugin owns                             | Core owns                                                             |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Parsing advertisements and choosing a device | Which readers plugins may use (an administrator opt-in per reader)    |
| Credentials, keys and the command protocol   | Device identity: the address a plugin may talk to is bound to it      |
| What a read, write or notification means     | The profile: only registered services, characteristics and operations |
| Deciding when to connect and when to give up | Payload bounds, deadlines, session leases and cancellation            |
| Deleting the endpoints it no longer needs    | Ownership (plugins never see each other's endpoints) and cleanup      |

Enforcement always runs in the host. The validation helpers are exported from the SDK so the fake behaves identically, but a plugin cannot skip them.

Administrators stay in control: a reader is closed to plugins by default. An administrator enables **Allow plugins to use Bluetooth** in the reader editor (General tab). Turning it off ends all plugin BLE sessions on that reader immediately; existing endpoints stay, but scans, new endpoints and sessions fail with `READER_ACCESS_DENIED`.

> [!WARNING]
> `BLE_TRANSPORT` does not fence off the escape hatches of other permissions. `DATABASE_ACCESS` bypasses ownership because it reads every table, and `RESOLVE_HOST_PROVIDERS` (`context.get`) can reach internal host services. Only install plugins you trust with those permissions, and never use them to read or change the `plugin_ble_endpoint` rows: use `context.ble` instead.

## Lifecycle

`context.ble` is available when the plugin declares `BLE_TRANSPORT`; without it the getter throws `PluginPermissionError`. The property is optional in the type so a plugin still type-checks against hosts that predate it.

```ts
import { PluginPermission, type PluginBackendModule } from '@attraccess/plugins-backend-sdk';

const plugin: PluginBackendModule = {
  register(context) {
    context.ble?.registerProfile({/* ... */});
    return { module: MyModule };
  },
};
```

- **`registerProfile` is synchronous.** It needs no host service, so you may call it from `register(context)`, a provider constructor or module scope, in any plugin load order.
- **Every other method is asynchronous and never throws synchronously.** Called before the host finished bootstrapping, it rejects with `PluginBleError('NOT_READY')` (retryable). It never waits. Call it from a lifecycle hook, a request handler or an event handler, or retry on `NOT_READY`.
- **The host builds your plugin twice.** At start-up a throwaway configuration app loads your plugin modules and is closed again, then the real application loads them. Your registrations run in both. Registering an identical definition again is idempotent, so this works without any code on your side. Registering a _different_ definition under an existing id throws `PROFILE_CONFLICT` and your plugin fails to load.
- Profiles are kept in memory per plugin id. Endpoints are stored by core in its database and survive restarts. After a restart an endpoint whose profile your plugin has not registered (yet) can be listed, updated and deleted, but opening a session fails with `PROFILE_NOT_REGISTERED`.

## Profiles

A profile is immutable and lists exactly what your plugin may do with a kind of device.

```ts
const profile = context.ble.registerProfile({
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
- **Bounds** (`maxReadBytes`, `maxWriteBytes`, `maxNotificationBytes`, 1..512) are required for every allowed operation. A write above its bound rejects with `PAYLOAD_TOO_LARGE` **before** anything reaches the reader. A read result or notification above its bound also rejects with `PAYLOAD_TOO_LARGE`.
- **`advertisement`** filters scans: a scan returns only advertisements that match every criterion you set (any listed service UUID, any listed manufacturer id from 0 to 0xffff, and the name prefix). A filter must set at least one of the three, otherwise `INVALID_PROFILE`. A profile without an advertisement filter cannot scan (`OPERATION_NOT_ALLOWED`).
- **`limits`** set the session lease cap (`maxSessionMs`, 1 ms up to 15 minutes; the default lease is 30 s or `maxSessionMs` if that is lower) and the notification queue up to 256 (`maxNotificationQueue`, default 32). Values above the host caps are rejected with `INVALID_PROFILE`.

The returned profile is deep-frozen. Invalid definitions throw `PluginBleError('INVALID_PROFILE')` with a message that names the field, for example `services[0].characteristics[1].maxReadBytes: is required for the allowed operations`.

## Readers and scanning

```ts
const readers = await context.ble.listReaders();
// [{ readerId: 3, name: 'Workshop door', available: true }]

const advertisements = await context.ble.scan(readers[0].readerId, 'door-lock', {
  durationMs: 5000, // default 5 s, max 15 s
  signal,
});
// [{ address: 'AA:BB:CC:DD:EE:01', addressType: 'public', rssi: -48, name: 'Lock 12',
//    serviceUuids: ['0000fff0-...'], manufacturerData: [{ companyId: 0x1234, data: Uint8Array }] }]
```

`listReaders` returns only readers an administrator opened for plugins. `available` is false when the host has no transport driver or the reader cannot do BLE right now.

## Endpoints

An endpoint binds one device address on one reader to one of your profiles. Core stores it, and exactly one plugin owns it.

```ts
const endpoint = await context.ble.createEndpoint({
  readerId: 3,
  address: 'aa:bb:cc:dd:ee:01', // normalized to AA:BB:CC:DD:EE:01
  addressType: 'public',
  profileId: 'door-lock',
  label: 'Workshop door', // optional, max 100 characters
});
// endpoint.id is an opaque UUID: store it in your own records.

await context.ble.listEndpoints(); // your endpoints only
await context.ble.getEndpoint(endpoint.id);
await context.ble.updateEndpoint(endpoint.id, { label: null, readerId: 4 }); // profileId is immutable
await context.ble.deleteEndpoint(endpoint.id);
```

- `profileId` must be registered by **your** plugin, otherwise `PROFILE_NOT_REGISTERED`.
- The reader must exist and be opted in: `READER_NOT_FOUND` or `READER_ACCESS_DENIED`.
- One physical address belongs to at most one plugin; another plugin binding it gets `ENDPOINT_CONFLICT`. One plugin may bind the same address on several readers, but only once per reader.
- Another plugin's endpoint id behaves exactly like a missing one (`ENDPOINT_NOT_FOUND`), so the existence of endpoints never leaks.
- Endpoints are removed when their reader is deleted and when your plugin is uninstalled.

## Sessions

```ts
const result = await context.ble.withSession(
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

| Member                                        | Behaviour                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `endpointId`                            | Identify the session and its endpoint.                                                                                                     |
| `read(key, { signal, timeoutMs })`            | Reads a characteristic; resolves with a copy of the bytes.                                                                                 |
| `write(key, value, { withoutResponse, ... })` | Writes. `withoutResponse` needs the `writeWithoutResponse` operation; otherwise `write` is required. Use it for bulk transfers.            |
| `subscribe(key, { signal })`                  | Starts notifications (`notify` or `indicate`). Returns a stream with `next({ timeoutMs, signal })`, an async iterator and `unsubscribe()`. |
| `unsubscribe(key)`                            | Stops a subscription. Unsubscribing without a subscription does nothing.                                                                   |
| `close()`                                     | Idempotent. Disconnects and ends the session.                                                                                              |
| `closed`                                      | A promise that resolves (never rejects) with `{ reason }` when the session ended.                                                          |

Rules:

- **One open session per endpoint.** A second `openSession` rejects with `ENDPOINT_BUSY` (retryable). There is no queue in the contract; serializing access per reader is the transport's job.
- **Operations run one at a time, in call order.**
- **Notifications** arrive in order per subscription, only to the owning session, in a bounded queue (default 32, profile maximum 256). When the queue overflows, the host discards the queued notifications and fails the stream at once instead of dropping data silently: every pending and later `next()` rejects with `NOTIFICATION_OVERFLOW`, while the session stays open. Call `session.unsubscribe(key)` and subscribe again to resume. Subscribing to a key that is already subscribed rejects with `INVALID_ARGUMENT`. Consume notifications promptly. The async iterator ends when the stream is unsubscribed or the session closes.
- **After `close`**, every further operation rejects with `SESSION_CLOSED`. Operations that were pending when the session closed reject once: `DISCONNECTED` if the device disconnected, `CANCELLED` if the open signal aborted, `SESSION_CLOSED` otherwise.
- **`closed` reasons:** `closed`, `lease-expired`, `cancelled`, `disconnected`, `reader-access-revoked`, `endpoint-deleted`, `shutdown`, `error`.
- **Cancellation.** Every method accepts an `AbortSignal`. Aborting rejects that pending call with `CANCELLED`. Aborting the signal you passed to `openSession` closes the session. A timed-out or cancelled operation does **not** close the session, unless the transport reports the link lost.

## Errors

Every failure is a `PluginBleError` with a stable `code`, a `retryable` flag, an optional `operation` and an optional `detail`. `detail` is a safe diagnostic and never contains payload bytes. Permission failures stay `PluginPermissionError`. Input validation errors (`INVALID_PROFILE`, `INVALID_ARGUMENT`) name the offending field in the message.

| Code                     | Retryable | Meaning                                                                |
| ------------------------ | --------- | ---------------------------------------------------------------------- |
| `NOT_READY`              | yes       | The host has not finished bootstrapping.                               |
| `TRANSPORT_UNAVAILABLE`  | yes       | The host has no reader transport (until ATT-1033 ships).               |
| `READER_NOT_FOUND`       | no        | The reader does not exist.                                             |
| `READER_ACCESS_DENIED`   | no        | An administrator has not opened the reader for plugins.                |
| `READER_OFFLINE`         | yes       | The reader is not connected or cannot do BLE now.                      |
| `READER_UNSUPPORTED`     | no        | The reader's firmware does not support BLE.                            |
| `READER_BUSY`            | yes       | The reader is serving another BLE connection.                          |
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

| Limit                                | Default | Maximum                                |
| ------------------------------------ | ------- | -------------------------------------- |
| Operation timeout (`timeoutMs`)      | 10 s    | 60 s                                   |
| Connect timeout (`connectTimeoutMs`) | 15 s    | 60 s                                   |
| Session lease (`leaseMs`)            | 30 s    | profile `maxSessionMs`, at most 15 min |
| Scan duration (`durationMs`)         | 5 s     | 15 s                                   |
| Notification queue per subscription  | 32      | 256 (profile `maxNotificationQueue`)   |
| Payload per characteristic           | -       | 1..512 bytes, set in the profile       |
| Endpoint label                       | -       | 100 characters                         |

Values above a cap are rejected with `INVALID_ARGUMENT` (or `INVALID_PROFILE` in a profile); they are never silently clamped. The constants are exported as `PLUGIN_BLE_LIMITS`.

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
| An administrator turns the reader off                                                                          | Its sessions close with `reader-access-revoked`. Endpoints stay.        |
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
| `addPeripheral(peripheral)`                         | A device: `readerId` or `readerIds`, `address`, `addressType`, `advertisement`, `characteristics`. Characteristics are keyed by UUID and take `value`, `onRead`, `onWrite` and `delayMs`. |
| `notify(address, uuid, bytes)`                      | The device sends a notification.                                                                                                                                                          |
| `disconnect(address)`                               | The device drops the link: sessions close with `disconnected`.                                                                                                                            |
| `failNext(op, code, { detail })`                    | The next `scan`, `connect`, `read`, `write`, `subscribe`, `unsubscribe` or `disconnect` fails.                                                                                            |
| `advance(ms)`                                       | Moves the manual clock: fires timeouts and lease expiry. No real timers are used.                                                                                                         |
| `transcript`, `openSessions()`                      | Every validated primitive that reached the transport, in order, and the open sessions.                                                                                                    |
| `createFakeBleHost({ ready })`, `setReady(ready)`   | Simulate calls before bootstrap (`NOT_READY`).                                                                                                                                            |

To test a timeout, give a characteristic a `delayMs` longer than the timeout, start the call, then `await host.advance(timeoutMs)`.

## Real readers

The fake and the host share the same validation and are checked by one contract test suite. The transport that carries BLE traffic through real Attractap readers (reader websocket protocol and firmware) arrives with ATT-1033. Notifications, cancellation and telemetry on real hardware follow with ATT-1036. Nothing in your plugin changes when it arrives; an administrator then enables **Allow plugins to use Bluetooth** on a reader.
