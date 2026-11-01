# Reader display

Plugins, for example a reservation plugin, can show short notes on the screen of Attractap readers, ask members
for a confirmation before a machine starts, refuse a start with a reason, and ask a short question after a stop.
This page explains what members see, which readers can show what, and the settings admins have. In the admin UI
all of this is called **Reader display**. Plugin developers find the technical contract in
[Developing plugins](plugins/developing-plugins.md#reader-ui-and-start-hooks).

## What members see

- **Notes on the screen (widgets):** a short status next to a resource in the list or on its details page, for
  example "Reserved 14:00–16:00". The reader's own status (in use, maintenance, unavailable, introduction
  required) always comes first; a plugin note only appears when none of those applies. A reader nobody is signed
  in to never shows personal information or other people's names.
- **Confirmation before a start:** the reader shows the plugin's question, for example "This machine is reserved
  at 14:00. Start anyway?", with **Cancel** and **Start**. Cancelling, or waiting until the question disappears
  (after about a minute), starts nothing; the reader returns to the resource. On the web app the same question
  appears as a dialog, and if it runs out the web app says so and asks to start again. Starting with a QR code
  and taking over someone else's session ask the same question.
- **Refused start:** the reader shows the plugin's reason on screen, for example who reserved the machine and
  until when. The web app shows the same reason as a notice.
- **Question after a stop:** some plugins ask a short question right after a session ends, for example whether
  the machine was left clean. The session is already over at that point; not answering within about 15 seconds
  simply uses the plugin's default answer. On the web app the default answer is used.
- **"Temporarily unavailable":** the plugin that checks starts is not answering, so the start cannot go ahead.
  Try again in a minute or ask the team. "Confirmation not possible" means the reader could not show the
  question at that moment; tap the card again.
- **Reader offline:** while a reader has no connection to the server, nothing starts and plugin notes disappear.

## Which readers can show what

| Reader                            | Notes on screen | Confirmation before a start             | Refused start    | Question after a stop |
| --------------------------------- | --------------- | --------------------------------------- | ---------------- | --------------------- |
| Attractap Touch, current firmware | yes             | on screen                               | reason on screen | yes                   |
| Attractap Lite (LEDs only)        | no              | second card tap, if allowed (see below) | red flash        | no (default answer)   |
| Attractap Touch, older firmware   | no              | no (see below)                          | generic error    | no (default answer)   |

Lite readers answer with their LEDs: an amber half ring followed by a red flash means the start was refused. An
amber ring that slowly drains, with one beep, means "tap your card again to confirm". The warning pattern means
the machine started, but with the plugin's warning.

## Readers without a screen

Some readers cannot show a confirmation: Lite readers, readers with older firmware and readers whose plugin
notes are paused after repeated crashes (see [Alerts](#alerts)). When a plugin asks for a confirmation on such a
reader, the resource setting **Readers without a screen** decides what happens:

| Setting                            | What happens                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Block the start** (default)      | The machine does not start. Lite shows the amber half ring and the red flash; a Touch reader with older firmware shows a generic error.                       |
| **Confirm with a second card tap** | Lite only: the amber ring drains, one beep. A second short tap by the **same person** starts the machine; another person's card cancels. Other readers block. |
| **Start with a warning**           | The machine starts **without** asking. Lite shows the warning pattern.                                                                                        |
| **Plugin default**                 | Uses whatever the plugin suggests (blocking, if it suggests nothing).                                                                                         |

A Touch reader with current firmware always shows the question itself; this setting never applies to it. Plugins
cannot control LEDs or sounds directly.

## Admin settings

- **Resource settings → Reader display:**
  - **Readers without a screen**, see above.
  - Per plugin: **Show widgets on readers** (the plugin's notes on this resource) and **If the plugin's check
    fails**. "Block the start" (recommended) keeps the machine closed while the plugin cannot check a start.
    "Allow the start" lets people start anyway; every such start is written to the audit log.
- **Reader editor → Reader display tab:** **Show plugin widgets on this reader**. Notes appear only when both this
  switch and the resource's switch are on. This tab saves immediately, not with the editor's Save button.
- The same tab lists **what plugins show on this reader**, per plugin and resource: **Shown**, **Shown as plain
  text** (the reader cannot show the plugin's layout and shows its text instead) or **Not shown** with the reason,
  for example "no room left on the reader's screen" or "the reader rejected it".

## Alerts

**Reader display alerts** appear at the bottom of the plugin settings and, for one reader, in the reader editor's
Reader display tab. Each alert says what is affected and what to do:

| Alert                      | What it means                                                                                                                            | What to do                                                                                                                                   | Ends by itself                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Plugin check keeps failing | The plugin failed to check several starts in a row and is no longer asked. Starts follow "If the plugin's check fails" of each resource. | The plugin is asked again after 60 seconds; **Clear** asks it right away. If it keeps failing, check the plugin's log or disable the plugin. | when the plugin answers again          |
| Plugin failed to load      | The plugin could not be loaded. Its checks and confirmations are not applied; starts go ahead without them.                              | Check the plugin's error on the plugins page, then reload or reinstall it.                                                                   | when the plugin loads again            |
| Reader keeps crashing      | The reader restarted repeatedly. Plugin notes are paused on it and confirmations follow "Readers without a screen".                      | Wait, or **Clear** to turn notes back on right away. If it keeps crashing, update the reader's firmware or report the crash.                 | after 30 minutes without another crash |

Clearing a plugin alert needs the permission to manage plugins, clearing a reader alert the permission to manage
readers. Raising and clearing alerts is written to the audit log.

## Audit log

Under **Settings → Audit log** admins find, among others: "Plugin start check decided", "Prompt shown on reader",
"Prompt on reader answered / expired / cancelled", "Setting for readers without a screen applied", "Start allowed
although the plugin check failed", "Plugin check paused or resumed after failures", "Reader display alert raised or
cleared" and "Reader display setting changed".
