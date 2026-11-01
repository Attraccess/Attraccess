# Using the Attractap Reader

Use your RFID card and the Attractap touch display to start or stop a machine, open a door, or request supervision. The reader shows the machines and doors assigned to it and the actions available to you.

You need an RFID card linked to your Attraccess account. If you do not have one yet, ask your administrator to register a card for you.

## Sign in with your card

1. Hold your card against the reader until your name appears at the top of the screen.
2. Remove your card. You stay signed in and can choose a machine or door from the list.
3. Tap the action on the **right** to use a resource, or its name on the **left** to see details.

![Signed-in reader showing resource names on the left and Start, Einweisung and Öffnen buttons on the right](../../_media/attractap/resource-list-signed-in.png)

_Your name and the remaining sign-in time appear at the top. The screenshots show the German display labels used in this guide._

You can also choose a resource **before** signing in. Tap its name, then hold your card against the reader when prompted. Its details open after you sign in. The left-arrow button at the far left of the header returns to the list.

![Card prompt for a selected resource, with a back arrow in the top-left corner](../../_media/attractap/card-prompt.png)

### Time and date

While nobody is signed in, the reader doubles as a clock. The card prompt shows the current time and date in large type with **RFID-Karte auflegen** (Hold your RFID card here) below it, and the resource list shows them at the top. The reader uses the time zone of your Attraccess server. After a restart, the clock appears once the reader has connected to the server; until then, the reader shows its usual sign-in text. If the connection drops later, the clock continues advancing internally, but the display shows the initialization screen until the reader reconnects.

During an outage, UTC continues advancing with the last server timezone offset. That offset stays fixed: daylight-saving changes or a change to the server's timezone take effect only after another valid server time sample arrives.

The signed-out card prompt keeps showing the clock when the selected resource is in use. Its header still shows the current user's name. Signing in opens the existing resource details and session controls.

## Start a machine or open a door

In the resource list, tap **Start** next to a machine or **Öffnen** (Open) next to a door. Complete any form or supervision step that appears, then wait for the result on the display.

While the reader processes an action, the controls are temporarily unavailable. Wait until the resource status has updated before tapping again. After a machine starts, its row shows your name and a **Stop** button.

### Choose a project

To record machine usage against a project, tap the machine's name to open its details, tap **Projekt wählen** (Choose project), and select your project before starting there. Starting directly from the list records the usage without a project.

### Results, messages and low balance

The reader reports results on a full screen of its own and returns to the screen you were on:

- A green check with **Nutzung gestartet** (Usage started) or **Nutzung beendet** (Usage ended) and the resource name, or **Aktion bestätigt** (Action confirmed) after a door or flow button. Tap anywhere to continue, or wait a moment.
- The **Gesamtkosten dieser Sitzung** (Total cost of this session) screen with the amount, when a stop is billed. Tap **OK** or wait.
- A red cross with **Anmeldung fehlgeschlagen** (Sign-in failed) when the card is not accepted. Tap **OK** or hold your card against the reader again.
- A warning with an explanation, for example **Status nicht verfügbar** (Status unavailable) after the reader signed you out because the machine status did not load. Tap **OK**, wait, or hold your card against the reader to sign in again.

![Usage started: a green check with the resource name](../../_media/attractap/usage-started.png)

![Total cost of the session on its own screen](../../_media/attractap/billing-total.png)

![Sign-in failed: a red cross, the reason and an OK button](../../_media/attractap/sign-in-failed.png)

When a single button's action fails, for example **Start**, the button itself turns red for about four seconds and reads **⚠ Fehlgeschlagen – erneut tippen** (⚠ Failed – tap to retry), or the reason, for example **⚠ Karte ist nicht aktiv** (⚠ Card is inactive). It keeps its size and place, and nothing else on the screen moves. Tap the button to retry. While the reader reloads the machine status after the failure, the message waits until the status is back. If the button now means something else, for example because someone else started the machine meanwhile, the message is dropped. If the button is no longer there, the reader shows a **Etwas ist schiefgelaufen** (Something went wrong) screen with the error code and a **Zurück** (Back) button.

The same applies to usage forms: if the server cannot take a page, the reason appears on **Weiter** (Next) or **Absenden** (Submit); if the form cannot be loaded at all, it closes and the reason appears on the button that opened it.

![A failed Start button, in red and in place](../../_media/attractap/button-error.png)

![Something went wrong, with the error code and a Back button](../../_media/attractap/generic-error.png)

If an action fails because your balance is too low and the reader has a payment terminal, the reader opens the **Unzureichendes Guthaben** (Insufficient balance) screen. Type the amount in whole euros on the number pad, tap **Aufladen** (Top up) and continue at the payment terminal when **Aufladung gestartet** (Top-up started) appears. A missing amount, or a top-up the server refuses, shows on **Aufladen** in the same way as a failed button; the amount you typed stays. **Abbrechen** (Cancel) returns you to where you were. Usage forms and the project selection are screens of their own as well. If the reader signs you out meanwhile, whichever screen is open is replaced like any other.

![The top-up screen with its number pad](../../_media/attractap/top-up.png)

Rebooting from the maintenance drawer and powering the reader off (on devices with a power button) ask for confirmation on a full screen with **Abbrechen** and the action next to each other.

![Reboot confirmation with Abbrechen and Neustart side by side](../../_media/attractap/reboot-confirm.png)

## View live usage stats

While signed in, tap the name of the machine you are using. Its details show the session duration and an **Aktuelle Nutzung** (Current usage) panel with consumed energy in **kWh**, machine operating time, and running or idle status. Readings refresh every 10 seconds while you view the details.

Energy readings require configured metering; operating time requires operating-state tracking. **Warte auf Messwert** means no current energy reading is available, and **Keine Daten** means operating-time data is unavailable. Missing readings are not counted as zero. Stats disappear when your usage ends or you sign out.

## Stop a machine

1. If you have been signed out, scan your card again.
2. Tap **Stop** next to the machine you are using. You can also open its details and tap **Sitzung beenden** (End session).
3. Complete any required end-of-use form and wait until the display confirms that the usage has ended.

![Machine details showing the user, start time, duration and Sitzung beenden button](../../_media/attractap/usage-details.png)

_The back arrow returns to the resource list. You remain signed in when you move between the list and details._

> [!IMPORTANT]
> **Abmelden** (Sign out) ends your sign-in on the reader. It does **not** stop machine usage. Use **Stop** or **Sitzung beenden** when you have finished using a machine.

### Session finished summary

After you successfully stop your own machine session, the reader shows **Danke, {name}!** with your account username. **Dauer** is the elapsed session time in hours, minutes and seconds, not machine operating time or billed minutes. Hours can exceed 24. **Abgerechnet** shows the final formatted charge when there is a nonzero charge; otherwise only the centered duration appears.

![Full-screen goodbye with elapsed duration and final charge](../../_media/attractap/session-summary-billed.png)

![Unbilled goodbye with centered duration](../../_media/attractap/session-summary-unbilled.png)

The summary stays visible for about **3.5 seconds**, then signs you out. Tap anywhere or present a card again to dismiss it sooner. A finger or card already held when the summary opens does not dismiss it. The dismissing card is consumed; remove it and scan again to sign in. Other running machine sessions continue.

Stopping from the list, details or after submitting a required end form produces the same summary. A failed stop does not show it. If you end another person's session as an administrator or introducer, you keep the existing confirmation and remain signed in. Readers using an older server without summary metadata keep the previous confirmation behavior.

The device currently uses German labels, including **Bis bald!**. Future English equivalents are **Thanks, {name}!**, **Duration**, **Charged**, and **See you soon!**.

## Complete a required form

Your organization may ask for information before a machine starts or stops, such as a condition check or material used.

1. Tap the field to enter or select your answer. Fields marked with **\*** are required.
2. Tap **Weiter** (Next) to move through the questions, if there is more than one.
3. Tap **Absenden** (Submit) on the last question and wait for the action to finish.

![End-of-use form with a required visual inspection field and Absenden button](../../_media/attractap/usage-end-form.png)

To cancel, tap the **×** in the top-right corner. You return to the list or details where you began. Cancelling a required form cancels the start or stop request; it does not complete it.

## Ask for supervision

If the action says **Aufsicht** (Supervision), tap it to request a supervised session. Ask an authorized introducer for that resource to supervise you.

The supervisor can hold their card against the reader or confirm the request in Attraccess on their phone or computer. Follow any further prompts and wait for confirmation that the machine usage has started.

![Supervision request asking for the supervisor's card or confirmation in the app](../../_media/attractap/supervision-request.png)

Tap **Abbrechen** (Cancel) if you do not want to continue. You stay signed in and can choose another resource.

## Understand the other buttons

The available action depends on your access and the resource's current status. You can tap the resource name to see its details even when you cannot start it.

| Display label                 | What to do                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Einweisung** (Introduction) | You need an introduction before you can use this resource. Open its details for guidance and contact an authorized introducer. |
| **Belegt** (Occupied)         | Someone else is using the machine. Wait until they finish.                                                                     |
| **Übernehmen** (Take over)    | Taking over the current usage is allowed. Tap to open the details, then choose the takeover action there.                      |
| **Gesperrt** (Blocked)        | The resource is unavailable to you because of maintenance or a reported problem. Contact the resource maintainer or resource manager for help.              |
| **Laden ...** (Loading)       | The reader is checking which actions are available to you. Wait for the button to update.                                      |

## Sign out when you are finished

Tap **Abmelden** at the top of the screen. The reader also signs you out after **30 seconds without interaction**. The countdown and bar show how much time remains; touching the display resets the countdown. It pauses while the reader processes an action.

After signing out, you can scan your card again to continue. Any running machine usage remains active, including when the reader signs you out automatically.

## If something does not work

| What you see                       | What to do                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your card does not sign you in     | Try again and keep the card in place until sign-in finishes. If it still fails, ask your administrator to check that the card is registered to your account. |
| A start, stop or door action fails | Read the message and check the resource's current status before trying again. If the problem continues, contact the resource maintainer or resource manager.                          |
| The reader loses its connection    | Wait for the connection to return, then sign in again. A lost connection does not end running machine usage.                                                 |

## Related guides

- [Using Resources](end-user/using-resources.md) – Use machines and tools from the Attraccess app
- [RFID Cards](attractap/rfid-cards.md) – Register and manage cards
- [Introductions](resources/introductions.md) – How access to a resource is granted
