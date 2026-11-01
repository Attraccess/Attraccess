# Reader UI capabilities

Attractap readers report what they can show in `READER_FIRMWARE_INFO` (`capabilities.ui`). Plugins and admins
use this to decide what a reader gets. Firmware without `ui` is treated as **schema version 0**: no plugin widgets
and no confirmation steps.

| Capability                                                     | Touch (WiFi / Ethernet), current firmware | Lite                | Older firmware (no `ui`) |
| -------------------------------------------------------------- | ----------------------------------------- | ------------------- | ------------------------ |
| Schema version                                                 | 1                                         | 1                   | 0                        |
| Display                                                        | Touch LCD                                 | none                | Touch LCD                |
| Slot widgets (`resourceList.row.status`, `resource.details.*`) | yes                                       | no                  | no                       |
| Start steps (`confirm`, `choose`, `info`)                      | yes                                       | `card-confirm` only | no                       |
| Block reason popup                                             | yes                                       | LED pattern         | generic error popup      |
| Post-stop question                                             | yes                                       | no (default answer) | no (default answer)      |
| LEDs / beeper                                                  | beeper                                    | LEDs and beeper     | as before                |
| Charset                                                        | Latin-1                                   | n/a                 | Latin-1                  |

Limits per reader: 3072 bytes payload, 4096 bytes per frame, 32 nodes per tree, depth 5, 64 live nodes.

## Readers without a screen

A confirmation cannot be shown on a Lite reader. The resource's **no-screen policy** decides:

| Policy               | Behaviour                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `block` (default)    | Amber half ring ("reserved"), then the red "blocked" pattern. The session does not start.                                                                 |
| `card-confirm`       | Amber ring that drains over the confirmation window and one beep. A second short tap by the **same user** starts the session; another user's tap cancels. |
| `allow-with-warning` | The session starts with a warning pattern.                                                                                                                |

The plugin sets its default; admins can override it per resource under **Resource settings → Reader display**.
Plugins cannot set raw LEDs or sounds.

## Admin settings

- Per resource: no-screen policy override, widgets on or off per plugin, and the hook failure policy per plugin
  (fail closed by default, fail open is audited).
- Per reader (reader editor): plugin widgets on or off. Widgets appear only when both toggles are on.
- The reader view lists every contribution as `rendered`, `degraded` or `skipped` with a reason.
- Open circuit-breaker and crash-loop alerts are listed and can be cleared there.
