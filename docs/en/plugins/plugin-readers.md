# Plugin Readers

<!-- llms-description: How backend plugins with READER_DEVICES register card readers, assign an access-only door and open it with a card authenticated on the device. -->

A backend plugin that owns a card reader (for example an NFC reader built into a door unit) can register it with
Attraccess as a **plugin reader**. A plugin reader behaves like an Attractap reader without a display: it is assigned one
resource, and a card held to it runs the one action the reader may run on that resource. Attraccess runs that action
with the same checks as on an Attractap reader, records it in the resource history for the card owner, runs the
resource's flows and writes an audit entry.

Today a plugin reader serves **access-only doors** and its only action is **Open**. Open is stored and reported like an
unlock of the door (`DoorUnlock`) and starts the flows of the "door unlocked" trigger.

## Permission

Declare `READER_DEVICES` together with `CARD_AUTHENTICATION` (see
[Card Authentication for Plugins](plugins/card-authentication.md)): the plugin authenticates the card first and hands the
proof of that authentication to the reader. The SDK describes the permission as _"Register the plugin's own card
readers. An administrator assigns each one a resource; a card authenticated on a reader runs its action on that resource
for the card owner, with the same checks as an Attractap reader."_

```json
{
  "permissions": ["CARD_AUTHENTICATION", "READER_DEVICES"]
}
```

Without the permission, reading `context.readers` throws `PluginPermissionError`. `context.readers` is optional in the
type, because hosts predating it do not provide it.

## Readers

```ts
const readers = context.readers;

await readers.register({
  deviceId: 'unit-1a2b', // your own id of the device; the same as `device` in cards.authenticate
  name: 'Workshop side entrance',
  capabilities: { resourceTypes: ['door'], actions: ['open'] },
});

await readers.assignResource('unit-1a2b', resourceId); // from your administration page, for example
```

| Call                                         | Meaning                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `register(input)`                            | Creates the reader, or updates name and capabilities of the reader with this device id. |
| `update(deviceId, { name?, capabilities? })` | Changes a reader. Capabilities that no longer allow the assigned resource unassign it.  |
| `remove(deviceId)`                           | Removes the reader and its assignment. Idempotent.                                      |
| `get(deviceId)` / `list()`                   | Your plugin's readers only; `get` resolves with `null` for an unknown device id.        |
| `assignResource(deviceId, resourceId)`       | Assigns the reader its resource, replacing a previous one.                              |
| `unassignResource(deviceId)`                 | Removes the assignment. Idempotent.                                                     |

A reader can only be assigned a resource its capabilities allow: a door with the **access only** option for `open`.
Anything else rejects with `RESOURCE_NOT_ALLOWED`. When the resource is deleted, the reader stays without a resource.

The management calls reject with a `PluginReaderError` carrying one of these stable codes:

| Code                   | Meaning                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`     | A device id, name, capability set or resource id that does not pass validation.   |
| `READER_NOT_FOUND`     | Your plugin has no reader with this device id.                                    |
| `LIMIT_REACHED`        | Your plugin already has 200 readers.                                              |
| `RESOURCE_NOT_FOUND`   | No resource with this id.                                                         |
| `RESOURCE_NOT_ALLOWED` | The reader's capabilities allow neither the resource type nor any of its actions. |

A host failure (for example the database is unavailable) rejects with a generic `Error` without details; retry later.

## Authenticate, then tap

A card held to your device is handled in two steps:

1. `context.cards.authenticate({ uid, device: deviceId, channel })` checks the card over your card channel. For a plugin
   with `READER_DEVICES`, a successful result carries `card.authentication`: an opaque, single-use proof of this
   authentication on this device, valid for 30 seconds.
2. `context.readers.tap({ deviceId, authentication })` runs the reader's action on its resource for the card owner.

```ts
const result = await context.cards.authenticate({ uid, device: deviceId, channel });
if (!result.ok) return showDenied(result.reason);

if (context.readers && result.card.authentication) {
  const tap = await context.readers.tap({ deviceId, authentication: result.card.authentication });
  return tap.ok ? openTheDoor() : showDenied(tap.reason);
}
```

The `if (context.readers && result.card.authentication)` check is the feature detection: hosts predating plugin readers
provide neither. The plugin never acts on a bare user id: only a card authenticated on the same device by the same
plugin can be tapped.

Open the door only when `tap` resolved with `ok: true`. The result names the action, the resource and the card owner:

```ts
{ ok: true, action: 'open', resourceId: 12, userId: 34 }
```

`tap` resolves for every outcome. It rejects only on a request your plugin got wrong (`TypeError`: no device id, no
authentication) or on a host failure (a generic `Error`; retry later with a new authentication).

### Refusal reasons

`tap.reason` is one of these stable strings (`PluginReaderTapFailureReason`). They are never renamed or removed.

| Reason                   | Meaning                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHENTICATION_INVALID` | The authentication is unknown, already used, or from another device or plugin.                                                                            |
| `AUTHENTICATION_EXPIRED` | The authentication is older than 30 seconds. Authenticate the card again.                                                                                 |
| `BUSY`                   | Another tap on this reader is still running. Retry with a new authentication.                                                                             |
| `READER_NOT_FOUND`       | Your plugin has no reader with this device id.                                                                                                            |
| `NO_RESOURCE`            | The reader has no resource assigned.                                                                                                                      |
| `ACTION_NOT_ALLOWED`     | None of the reader's actions is allowed on its resource, for example the door is no longer access only.                                                   |
| `ACCESS_DENIED`          | The card owner may not use the resource: no permission, no introduction, the account is disabled, or the card was deactivated since it was authenticated. |
| `MAINTENANCE`            | The resource is under maintenance or reported unhealthy, and the card owner may not manage maintenance.                                                   |
| `FLOW_FAILED`            | The action was recorded for the card owner, but a flow attached to it failed. Do not retry: a retry records the action again.                             |

Every tap consumes its authentication, also a refused one. Each tap on a reader with a known device id is written to
the audit log ("Card held to a plugin reader") with your plugin id, the device id, the resource, the card, the owner,
and the result or reason. The authentication itself is never logged.

## Limits

`PLUGIN_READER_LIMITS` in the SDK:

| Limit                         | Value               |
| ----------------------------- | ------------------- |
| Readers per plugin            | 200                 |
| Device id                     | 1 to 200 characters |
| Name                          | 1 to 100 characters |
| Resources per reader          | 1                   |
| Validity of an authentication | 30 s                |

Authentications live in memory only: a restart of the API, or disabling the plugin, invalidates them.

## Lifecycle

- Disabling a plugin keeps its readers and their assignments; they work again once the plugin is enabled.
- Uninstalling a plugin deletes its readers.
- Turning the access-only option of an assigned door off does not unassign the reader: its taps are refused with
  `ACTION_NOT_ALLOWED` until the option is on again.
