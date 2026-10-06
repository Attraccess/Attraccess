# RFID Cards

RFID cards are the physical keys that let users access machines and doors via Attractap readers. Each card is linked to a user account in Attraccess.

## How RFID Cards Work

When a user holds an RFID card to an Attractap reader, the reader sends the card's unique ID to the Attraccess backend. The backend checks:

1. Is this card registered in the system?
2. Which user account is the card linked to?
3. Does that user have permission to use the assigned resource?

If all checks pass, access is granted.

## Managing RFID Cards

Open **RFID Cards** in the sidebar to manage your own cards. The list shows each card's ID, UID, creation date, and last-seen time.

### Registering a New Card

1. Click **Enroll RFID Card**
2. Select a connected Attractap that supports card enrollment
3. Click **Enroll** and follow the instructions on the reader

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

## Administrator Features

The `users.rfid-cards.manage` permission allows managing RFID cards for any user. The **Administrator** role includes it automatically; it can also be granted through a custom role.

Open **Users**, select a user, and click **Manage RFID Cards**. This screen supports the same enrollment, activation, deactivation, and deletion actions for the selected user. Accessing user details also requires `users.read`. Enrollment links the card to the selected user, and the audit log records the administrator who performed the action.

## See Also

- [Using the Reader](attractap/using-the-reader.md) – Sign in with your card and use machines or doors
- [Overview](attractap/overview.md) -- What is Attractap?
- [Setup](attractap/setup.md) -- Register and configure readers
- [User Management](user-management/overview.md) -- Manage user accounts
- [Introductions](resources/introductions.md) -- Manage resource access permissions
