# RFID Cards
<!-- llms-description: How RFID cards link to user accounts, how to manage cards, supported card types, insecure UID-only cards and which readers may enroll or reset cards. -->

RFID cards are the physical keys that let users access machines and doors via Attractap readers. Each card is linked to a user account in Attraccess.

## How RFID Cards Work

When a user holds an RFID card to an Attractap reader, the reader sends the card's unique ID to the Attraccess backend. The backend then talks to the card **through the reader** and checks:

1. Is this card registered in the system?
2. Does the card prove it holds the secret key stored for it? (A copied card ID is not enough.)
3. Which user account is the card linked to?
4. Does that user have permission to use the assigned resource?

If all checks pass, access is granted. The reader only passes messages between the backend and the card: **card keys are created and checked by the server, and a tap never exposes a card key to the reader**. A reader that is offline grants nothing.

Card keys are random, 16 bytes each, and stored encrypted. See [Security Settings](settings/security.md) for backing up the secret that protects them.

## Managing RFID Cards

Open **RFID Cards** in the sidebar to manage your own cards. The list shows each card's ID, UID, creation date, and last-seen time.

### Registering a New Card

1. Click **Enroll RFID Card**
2. Select a connected Attractap that supports card enrollment
3. Click **Enroll** and follow the instructions on the reader

A secure card is only registered after the server has checked that the card accepted its new key (a [UID-only card](#uid-only-cards-insecure) gets no key). If the card is pulled away or the write fails, nothing is recorded; present the same card again and the enrollment is finished.

> [!NOTE]
> Readers need firmware 2.0.0 or later for every card function. Readers on older firmware are offered the 2.0.0 update automatically when they connect (see [Firmware Updates](attractap/firmware-updates.md)). Until they run it, the server rejects their card taps and they cannot enroll or reset cards. Cards that were enrolled before keep working once the reader is updated.

### Activating and Deactivating Cards

Use **Activate** or **Deactivate** next to a card and confirm the action. Activating a card automatically deactivates your other cards, so only one card is active per user. Deactivate a lost card immediately to revoke its access without needing the physical card.

### Removing a Card

1. Click **Delete** next to the card
2. Select a connected Attractap and confirm **Delete**
3. Follow the instructions on the reader to reset the physical card

The card is removed from the account after the server has checked that the card is back in its factory state. The physical card is required; use **Deactivate** if it is unavailable.

**UID-only cards** need no reader: nothing is written to them, so **Delete** asks for a confirmation and removes the card right away. The owner or a user with `users.rfid-cards.manage` can do this, and the audit log records it.

## Multiple Cards Per User

Each user can have multiple RFID cards linked to their account. This is useful when:

- A user needs a backup card
- A user has different cards for different locations
- A lost card needs to be replaced while keeping the old one disabled

## Card Types

Attractap readers use AES-encrypted authentication, which requires cards with hardware crypto support, unless an administrator allows UID-only cards:

| Card Type | Supported |
|-----------|-----------|
| NTAG424 DNA | Yes |
| MIFARE DESFire EV2/EV3 | Yes |
| MIFARE DESFire EV1 | Only as a [UID-only card](#uid-only-cards-insecure) |
| MIFARE Classic / Ultralight / NTAG213-216 | Only as a [UID-only card](#uid-only-cards-insecure) |
| UID-only (insecure, needs setting) | Only while an administrator allows it, [see below](#uid-only-cards-insecure) |

> [!NOTE]
> On MIFARE DESFire cards, Attractap stores its keys in a dedicated DESFire application (AID `0xACCE55`), which is created automatically during enrollment. Other applications on the card (e.g. existing access systems) are not touched.

## UID-Only Cards (Insecure)

Cheap RFID cards (MIFARE Classic, MIFARE Ultralight, NTAG213/215/216 and DESFire EV1) cannot do AES authentication. They only offer their UID. An administrator can allow them under **Settings -> RFID card enrollment** with the switch **Allow UID-only cards (insecure)**. It is off by default, only users with `system.settings.manage` can change it, and turning it on asks for a confirmation. Every change is recorded in the audit log.

> [!WARNING]
> **UID-only cards can be copied with cheap tools.** The server only compares the UID, so anyone who reads such a card can impersonate its owner on machines and doors, including doors opened through plugins such as the CES lock plugin. Allow them only if you accept this risk.

How it works:

- **One switch for the installation.** It covers all readers and plugins; there is no per-reader or per-resource setting.
- **Enrollment falls back automatically.** The reader first checks whether the card can do AES. A card that can is always enrolled securely. A card that cannot is enrolled as a UID-only card, but only while the setting is on; otherwise the reader shows "Card is not supported". A secure card (NTAG 424 DNA, DESFire EV2/EV3) is never enrolled as UID-only, even when its secure enrollment fails.
- **The card record decides how a tap is checked.** A secure card always has to prove its key, whatever the setting says, so copying its UID onto a cheap card does not work. A UID-only card is accepted on its UID alone, and only while the setting is on.
- **Cards with a random UID are refused.** A card that changes its UID on every tap cannot be recognised again, so the reader shows "Card with a random UID is not supported".
- **Turning the setting off.** Existing UID-only cards stay in the card lists, marked **UID only, disabled**, but readers refuse them ("UID-only cards are disabled") and plugin devices refuse them as not supported until the setting is turned on again. They do not have to be enrolled again.
- **Card lists.** UID-only cards carry a **UID only** chip.

> [!NOTE]
> The reader reports the card type, so readers need firmware 2.14.0 or later to enroll and use UID-only cards. Readers on older firmware behave as before: they cannot enroll UID-only cards, and they refuse enrolled ones ("Card is not supported").

## Which Readers May Enroll and Reset Cards

By default every reader with a display and firmware 2.0.0 or later can enroll and reset cards. Administrators can limit this under **Settings -> RFID card enrollment**: choose **Selected readers** and tick the readers that may write cards, or choose **Only secured readers** to allow every reader that is currently [secured](attractap/reader-security.md#secure-a-reader). The enrollment and reset screens then list only those readers, and the server refuses enrollment and reset on any other reader. With **Only secured readers**, a reader that loses its **Secured** status (for example after a failing security report) can no longer write cards until it is secured again. All readers still let members sign in with their cards.

Readers whose pairing was removed appear only in the **Not paired** list on the readers page, where you pair them again. They are not shown in the reader list, in any picker, in the settings or in resource assignment, and they can never enroll or reset cards, supervise a start or run a mass introduction. Such a reader cannot connect until it is paired again, so it takes no card taps, doors, resources or flows.

> [!IMPORTANT]
> **Only allow paired readers you trust to enroll and reset cards.** A new card still has the public factory key, so the server writes the new card key under that factory key.
>
> - **The connection:** a [paired reader](attractap/pairing.md) talks to the server over an encrypted connection, so nobody listening on the network can read the key. A reader that is not paired cannot connect at all, so it can never enroll or reset cards.
> - **The reader itself:** the reader that relays the write can still work out the new key. A reader that was tampered with could therefore copy cards enrolled or reset on it. Use **Settings -> RFID card enrollment** to keep this to readers in a place you control, for example the front desk. [Secured readers](attractap/reader-security.md) address tampered readers within their [limits](attractap/reader-security.md#attacker-model-and-limits); choose **Only secured readers** to write cards only through them.
>
> Normal taps are not affected: when a card is used, the server checks it without the key ever passing through the reader.

## Administrator Features

The `users.rfid-cards.manage` permission allows managing RFID cards for any user. The **Administrator** role includes it automatically; it can also be granted through a custom role.

Open **Users**, select a user, and click **Manage RFID Cards**. This screen supports the same enrollment, activation, deactivation, and deletion actions for the selected user. Accessing user details also requires `users.read`. Enrollment links the card to the selected user, and the audit log records the administrator who performed the action.

## See Also

- [Using the Reader](attractap/using-the-reader.md) – Sign in with your card and use machines or doors
- [Overview](attractap/overview.md) -- What is Attractap?
- [Setup](attractap/setup.md) -- Register and configure readers
- [User Management](user-management/overview.md) -- Manage user accounts
- [Introductions](resources/introductions.md) -- Manage resource access permissions
