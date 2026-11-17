# Card Authentication for Plugins

<!-- llms-description: How backend plugins with CARD_AUTHENTICATION let Attraccess authenticate an NFC card on their own device over a card channel: limits, failure reasons, BLE example. -->

A backend plugin that owns an NFC-capable device (a terminal, a door unit, a machine panel) can let Attraccess
authenticate a card held to that device. The plugin hands over the card's UID and a **card channel**: a function that
relays one APDU to the card and returns the card's answer. Attraccess runs the same check as for a tap on an Attractap
reader over that channel and tells the plugin whose card it is.

A card enrolled at an Attractap therefore works the same way at the plugin's device, with the same failure meanings.

## Trust boundary

| Your plugin owns                                               | Core owns                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| The device, its link (BLE, serial, network) and its framing    | Card keys, session keys and secure messaging                     |
| Reporting the UID and relaying APDUs and answers byte for byte | Card type detection and the decision whether the card is genuine |
| Access decisions after authentication                          | Limits, timeouts and the server-wide conversation budget         |

Card keys and session keys never leave the API. The plugin only sees the APDUs Attraccess sends and the card's answers;
both are protected by the card's secure messaging. The result carries the card's `id`, `uid` and `userId`, nothing else.

## Permission

Declare `CARD_AUTHENTICATION` in your manifest. Administrators see the permission on the Plugins page when they install
the plugin. The SDK describes it as _"Authenticate NFC cards held to the plugin's own devices with the Attraccess card
keys. The plugin receives the card and its owner, never the keys."_

```json
{
  "permissions": ["CARD_AUTHENTICATION", "ACCESS_RESOURCES"]
}
```

Without the permission, reading `context.cards` throws `PluginPermissionError`. `context.cards` is optional in the type,
because hosts predating it do not provide it; such a host throws an "unavailable in this host" error.

## Usage

```ts
import type { PluginCardChannel, PluginContext } from '@attraccess/plugins-backend-sdk';

async function onCardPresented(
  context: PluginContext,
  deviceId: string,
  uid: string,
  channel: PluginCardChannel,
  resourceId: number,
) {
  const cards = context.cards;
  if (!cards) throw new Error('This plugin needs a host with card authentication support');
  const cardLeft = new AbortController(); // abort it when your device reports that the card left the field
  const result = await cards.authenticate({ uid, device: deviceId, channel, signal: cardLeft.signal });
  if (!result.ok) return deny(result.reason);

  // Authentication only says whose card it is. Whether that person may do something is your plugin's decision.
  const access = await context.resourceAccess.canStart(result.card.userId, resourceId);
  return access.allowed ? grant(result.card.userId) : deny('NO_ACCESS');
}
```

### The card channel

```ts
interface PluginCardChannel {
  exchange(apdu: Uint8Array, options: { signal: AbortSignal }): Promise<Uint8Array>;
}
```

- Relay one complete APDU to the card and resolve with the card's **full** answer, status bytes included.
- Attraccess sends one APDU at a time and waits for its answer before sending the next.
- `options.signal` is aborted when Attraccess no longer waits for the answer (exchange timeout, conversation timeout,
  abort, plugin unload). Stop relaying then. An answer that arrives later is ignored.
- Reject when your device fails. Resolving with anything that is not a `Uint8Array`, or with more than 64 bytes, ends
  the conversation with `DEVICE_ERROR`.
- Never log APDUs or answers: they carry cryptograms.

### Request

| Field     | Meaning                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uid`     | The card UID, hex, 4 to 32 characters; anything else resolves with `INVALID_UID`. It is compared exactly: send it in lowercase, as Attractap readers do.       |
| `device`  | Your own id of the device that holds the card (1 to 200 characters), for example a BLE endpoint id.                                                            |
| `channel` | The card channel above.                                                                                                                                        |
| `signal`  | Optional. Abort it when the card left the field or you give up; the conversation ends with `CARD_REMOVED`. An already aborted signal ends it before it starts. |

`authenticate` resolves for every card or conversation outcome. It rejects in two cases only:

- A programming error (`TypeError`): a missing `channel.exchange`, a `device` that is empty or longer than 200
  characters, or a `signal` that is not an `AbortSignal`. Such a request leaves the running conversation alone.
- A host failure, for example the database is unavailable or the API is still starting: a generic `Error` without
  details. It is temporary; retry later.

### One conversation per device

Attraccess runs one conversation per plugin and `device`. A new `authenticate` for the same device ends the running one
with `CARD_REMOVED` and aborts the `signal` of its pending exchange, just as a new card on an Attractap reader replaces
the previous one. This happens before the UID and the server-wide limit are checked, so a request that then resolves
with `INVALID_UID` or `BUSY` still ends the old one. Conversations on different devices, and devices of other plugins, run side by side.

## Limits

The limits are the same as for Attractap readers (`PLUGIN_CARD_LIMITS` in the SDK):

| Limit                            | Value    |
| -------------------------------- | -------- |
| Time per exchange                | 3 s      |
| Time per conversation            | 15 s     |
| Exchanges per conversation       | 32       |
| Longest answer (status included) | 64 bytes |
| Longest APDU Attraccess sends    | 62 bytes |

Plugin conversations count toward the same server-wide limit as reader conversations. At the limit, `authenticate`
resolves with `BUSY`.

## Failure reasons

`result.reason` is one of these stable strings (`PluginCardFailureReason`). They are never renamed or removed.

| Reason                       | Meaning                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BUSY`                       | The server is at its limit of concurrent card conversations. Retry later.                                    |
| `CARD_REMOVED`               | Your `signal` was aborted, or a newer `authenticate` for the same device took over.                          |
| `TIMEOUT`                    | One exchange took longer than 3 s, or the conversation longer than 15 s.                                     |
| `TOO_MANY_EXCHANGES`         | The conversation needed more than 32 exchanges.                                                              |
| `DEVICE_ERROR`               | `exchange` rejected or threw, or answered with something that is not a `Uint8Array` or longer than 64 bytes. |
| `CANCELLED`                  | The API is shutting down or unloading your plugin.                                                           |
| `INVALID_UID`                | The UID is not 4 to 32 hex characters.                                                                       |
| `CARD_NOT_FOUND`             | No card is enrolled for this UID.                                                                            |
| `CARD_NOT_ACTIVE`            | The card is enrolled but not the user's active card.                                                         |
| `CARD_NOT_SUPPORTED`         | The card type is not supported (for example a DESFire EV1).                                                  |
| `CARD_AUTHENTICATION_FAILED` | The card did not prove the stored key: a copied UID, a foreign card or a tampered answer.                    |

Unlike on Attractap readers, `TIMEOUT` and `TOO_MANY_EXCHANGES` are reported separately.

Disabling, enabling, installing or uninstalling a plugin restarts the API. Running conversations end with the process
then; `CANCELLED` reaches your plugin when the API shuts down gracefully (for example on `SIGTERM`).

## Interrupted enrollments and resets

When an enrollment or reset at an Attractap was interrupted after the key was written, the next presentation of the card
finishes it, at a reader or at your device. Your plugin gets the same result as a reader:

- A finished enrollment resolves with the new card (`ok: true`), or with `CARD_NOT_ACTIVE` when the user already has
  another active card.
- A finished reset deletes the card and resolves with `CARD_NOT_FOUND`.

Audit entries written in that case carry the source `plugin-recovery` and your plugin's id (`details.pluginId`) instead
of a reader id.

Enrolling or resetting cards through a plugin device is not possible: plugins can only authenticate.

## Example: a card channel over Bluetooth

This example relays APDUs over [`context.ble`](plugins/ble-transport.md) to a device that holds the card. The framing is
made up for the example: the plugin writes `[seq, ...apdu]` to one characteristic, and the device answers with a
`[seq, ...answer]` notification on another. Your device defines its own framing. Declare both `BLE_TRANSPORT` and
`CARD_AUTHENTICATION`.

```ts
import type {
  PluginBleContext,
  PluginBleSession,
  PluginCardChannel,
  PluginCardsContext,
} from '@attraccess/plugins-backend-sdk';

// In register(context), after checking that context.ble and context.cards exist:
ble.registerProfile({
  id: 'nfc-terminal',
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'command', uuid: 'fff1', operations: ['write'], maxWriteBytes: 63 },
        { key: 'answer', uuid: 'fff2', operations: ['notify'], maxNotificationBytes: 65 },
      ],
    },
  ],
});

async function bleCardChannel(session: PluginBleSession): Promise<PluginCardChannel> {
  const answers = await session.subscribe('answer');
  let seq = 0;
  return {
    async exchange(apdu, { signal }) {
      seq = (seq + 1) & 0xff;
      await session.write('command', Uint8Array.of(seq, ...apdu), { signal });
      for (;;) {
        const { value } = await answers.next({ signal });
        if (value[0] === seq) return value.subarray(1); // skip stale answers of aborted exchanges
      }
    },
  };
}

function cardPresented(ble: PluginBleContext, cards: PluginCardsContext, endpointId: string, uid: string) {
  return ble.withSession(endpointId, async (session) =>
    cards.authenticate({ uid, device: endpointId, channel: await bleCardChannel(session) }),
  );
}
```

The BLE errors your `exchange` rejects with (for example `TIMEOUT` or `DISCONNECTED`) end the conversation with
`DEVICE_ERROR`.

## Testing

The API's own tests run plugin card authentication against emulated DESFire EV2/EV3 and NTAG 424 cards, including the
BLE example above on top of the SDK's BLE fake (`createFakeBleHost`, see
[Testing with the fake](plugins/ble-transport.md)). In your plugin's tests, stub `context.cards.authenticate` and test
your channel against a fake device: check that it returns each answer whole, with status bytes, and that it stops when
`signal` is aborted.
