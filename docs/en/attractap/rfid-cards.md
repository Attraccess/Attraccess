# RFID Cards

RFID cards are the physical keys that let users access machines and doors via Attractap readers. Each card is linked to a user account in Attraccess.

## How RFID Cards Work

When a user holds an RFID card to an Attractap reader, the reader sends the card's unique ID to the Attraccess backend. The backend then talks to the card **through the reader** and checks:

1. Is this card registered in the system?
2. Does the card prove it holds the secret key stored for it? (A copied card ID is not enough.)
3. Which user account is the card linked to?
4. Does that user have permission to use the assigned resource?

If all checks pass, access is granted. The reader only passes messages between the backend and the card: **card keys are created and checked by the server and never reach a reader**. A reader that is offline grants nothing.

Card keys are random, 16 bytes each, and stored encrypted. See [Security Settings](settings/security.md) for backing up the secret that protects them.

## Managing RFID Cards

Open **RFID Cards** in the sidebar to manage your own cards. The list shows each card's ID, UID, creation date, and last-seen time.

### Registering a New Card

1. Click **Enroll RFID Card**
2. Select a connected Attractap that supports card enrollment
3. Click **Enroll** and follow the instructions on the reader

A card is only registered after the server has checked that the card accepted its new key. If the card is pulled away or the write fails, nothing is recorded; present the same card again and the enrollment is finished.

> [!NOTE]
> Only readers running firmware 2.0.0 or later can enroll and reset cards. Older readers are updated automatically the next time they connect (see [Firmware Updates](attractap/firmware-updates.md)); until then they offer no card functions and show that an update is needed. Cards that were enrolled before keep working.

### Activating and Deactivating Cards

Use **Activate** or **Deactivate** next to a card and confirm the action. Activating a card automatically deactivates your other cards, so only one card is active per user. Deactivate a lost card immediately to revoke its access without needing the physical card.

### Removing a Card

1. Click **Delete** next to the card
2. Select a connected Attractap and confirm **Delete**
3. Follow the instructions on the reader to reset the physical card

The card is removed from the account after the reader confirms the reset succeeded. The physical card is required; use **Deactivate** if it is unavailable.

## Multiple Cards Per User

Each user can have multiple RFID cards linked to their account. This is useful when:

- A user needs a backup card
- A user has different cards for different locations
- A lost card needs to be replaced while keeping the old one disabled

## Card Types

Attractap readers use AES-encrypted authentication, which requires cards with hardware crypto support:

| Card Type | Supported |
|-----------|-----------|
| NTAG424 DNA | Yes |
| MIFARE DESFire EV2/EV3 | Yes |
| MIFARE DESFire EV1 | No (lacks the required authentication mode) |
| MIFARE Classic / Ultralight / NTAG213-216 | No (no AES authentication) |

> [!NOTE]
> On MIFARE DESFire cards, Attractap stores its keys in a dedicated DESFire application (AID `0xACCE55`), which is created automatically during enrollment. Other applications on the card (e.g. existing access systems) are not touched.

## Which Readers May Enroll and Reset Cards

By default every reader can enroll and reset cards. Administrators can limit this under **Settings -> Card readers**: choose **Selected readers** and tick the readers that may write cards. The enrollment and reset screens then list only those readers. All readers still let members sign in with their cards.

## Administrator Features

The `users.rfid-cards.manage` permission allows managing RFID cards for any user. The **Administrator** role includes it automatically; it can also be granted through a custom role.

Open **Users**, select a user, and click **Manage RFID Cards**. This screen supports the same enrollment, activation, deactivation, and deletion actions for the selected user. Accessing user details also requires `users.read`. Enrollment links the card to the selected user, and the audit log records the administrator who performed the action.

## See Also

- [Using the Reader](attractap/using-the-reader.md) – Sign in with your card and use machines or doors
- [Overview](attractap/overview.md) -- What is Attractap?
- [Setup](attractap/setup.md) -- Register and configure readers
- [User Management](user-management/overview.md) -- Manage user accounts
- [Introductions](resources/introductions.md) -- Manage resource access permissions
