# NFC Cards

NFC cards are the physical keys that let users access machines and doors via Attractap readers. Each card is linked to a user account in Attraccess.

## How NFC Cards Work

When a user holds an NFC card to an Attractap reader, the reader sends the card's unique ID to the Attraccess backend. The backend checks:

1. Is this card registered in the system?
2. Which user account is the card linked to?
3. Does that user have permission to use the assigned resource?

If all checks pass, access is granted.

## Managing NFC Cards

### Viewing All Cards

1. Navigate to **Attractap** in the sidebar
2. Click on **NFC Cards**
3. You see a list of all registered NFC cards with their assigned users

<!-- TODO: Screenshot of the NFC Cards list -->

### Registering a New Card

To register a new NFC card:

1. Navigate to **Attractap** > **NFC Cards**
2. Click **Add NFC Card**
3. Select the user who should receive the card
4. Hold the new NFC card to any connected Attractap reader
5. The card ID is automatically detected and registered

> [!TIP]
> You can also register a card directly from the user's profile page.

<!-- TODO: Screenshot of the Add NFC Card dialog -->

### Removing a Card

1. Navigate to **Attractap** > **NFC Cards**
2. Find the card you want to remove
3. Click the **Delete** button
4. Confirm the removal

> [!NOTE]
> Removing a card immediately revokes access. The card can no longer be used at any reader.

## Multiple Cards Per User

Each user can have multiple NFC cards linked to their account. This is useful when:

- A user needs a backup card
- A user has different cards for different locations
- A lost card needs to be replaced while keeping the old one disabled

## Card Types

Attractap readers support standard NFC cards compatible with the PN532 reader:

| Card Type | Supported |
|-----------|-----------|
| MIFARE Classic 1K/4K | Yes |
| MIFARE Ultralight | Yes |
| NTAG213/215/216 | Yes |
| Other ISO 14443A cards | Yes |

## Administrator Features

Administrators can:

- View all registered cards across all users
- Register cards on behalf of users
- Remove cards from user accounts
- See which reader last scanned a card

## See Also

- [Overview](attractap/overview.md) -- What is Attractap?
- [Setup](attractap/setup.md) -- Register and configure readers
- [User Management](user-management/overview.md) -- Manage user accounts
- [Introductions](resources/introductions.md) -- Manage resource access permissions
