# Reader display

Plugins can show small widgets on Attractap readers and ask for a confirmation before a session starts. This page
covers what each reader can show and the admin settings, which the UI calls **Reader display**. Plugin developers
find the contract in [Developing plugins](plugins/developing-plugins.md#reader-ui-and-start-hooks).

## Capabilities

Attractap readers report what they can show in `READER_FIRMWARE_INFO` (`capabilities.ui`). Plugins and admins
use this to decide what a reader gets. Firmware without `ui` is treated as **schema version 0**: no plugin widgets
and no confirmation steps.

| Capability                                                     | Touch (WiFi / Ethernet), current firmware | Lite                | Older firmware (no `ui`) |
| -------------------------------------------------------------- | ----------------------------------------- | ------------------- | ------------------------ |
| Schema version                                                 | 1                                         | 1                   | 0                        |
| Display                                                        | Touch LCD                                 | none                | Touch LCD                |
| Slot widgets (`resourceList.row.status`, `resource.details.*`) | yes                                       | no                  | no                       |
| Start confirmation (`confirm`)                                 | yes                                       | `card-confirm` only | no                       |
| Block reason popup                                             | yes                                       | red "blocked" flash | generic error popup      |
| Post-stop question                                             | yes                                       | no (default answer) | no (default answer)      |
| LEDs / beeper                                                  | beeper                                    | LEDs and beeper     | as before                |
| Charset                                                        | Latin-1                                   | n/a                 | Latin-1                  |

Before a start, plugins can only ask for a `confirm` step for now: the pre-start hook allows, confirms or blocks.
The `choose` and `info` start steps are part of the schema and the firmware but reserved for a later version. The
post-stop question uses its own choice step.

Limits per reader: 3072 bytes payload, 4096 bytes per frame, 32 nodes per tree, depth 5, 64 live nodes.

## Readers without a screen

A reader with a screen and current firmware shows the confirmation. If it cannot show it at that moment, the start
is blocked with "Confirmation not possible" (code `CONFIRMATION_UNAVAILABLE`); the no-screen policy never applies
there.

The resource's **no-screen policy** applies to readers that cannot show the confirmation step: Lite readers,
readers with older firmware (no reader UI) and readers whose plugin widgets are suspended after repeated crashes.

| Policy               | Behaviour                                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block` (default)    | The session does not start. Lite shows an amber half ring ("reserved"), then the red "blocked" flash; a Touch reader shows the plugin's text (older firmware a generic error).            |
| `card-confirm`       | Lite only: an amber ring drains over the confirmation window, with one beep. A second short tap by the **same user** starts the session; another user's tap cancels. Other readers block. |
| `allow-with-warning` | The session starts **without a confirmation**; Lite shows the warning pattern.                                                                                                            |

A plugin's own `block` decision shows the red "blocked" flash on Lite. The plugin sets the default policy; admins
can override it per resource under **Resource settings → Reader display**, where "Plugin default" uses the
plugin's choice (`block` if it sets none). Plugins cannot set raw LEDs or sounds.

## Admin settings

- **Resource settings → Reader display:** the no-screen policy, and per plugin whether it shows widgets and what
  happens when its hook fails ("Block the start", the default, or "Allow the start", which is audited).
- **Reader editor → Reader display tab:** plugin widgets on or off for this reader. Widgets appear only when both
  the resource and the reader setting are on. This tab saves immediately, not with the editor's Save button.
- The same tab lists every plugin contribution as **Rendered**, **Degraded** or **Skipped** with a reason, for
  example "too many widget elements on this reader" or "dropped by the reader".

## Alerts

**Reader display alerts** are listed in the plugin settings and, for one reader, in the reader editor:

| Alert                                        | Effect                                                                       | Clears by itself                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Plugin hook disabled after repeated failures | Starts follow the plugin's failure policy without calling the hook.          | when the hook answers again: after 60 s the next start calls it once |
| Plugin with access hooks failed to load      | The plugin's start hooks are not applied.                                    | when the plugin loads again                                          |
| Reader suspended after a crash               | No plugin widgets on that reader; confirmations follow the no-screen policy. | after 30 minutes without another crash                               |

**Clear** ends an alert early. Clearing a plugin alert needs the permission to manage plugins, clearing a reader
crash-loop alert the permission to manage readers. Every change is audited.
