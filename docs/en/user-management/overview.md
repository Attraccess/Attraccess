# User Management

User management allows administrators to create user accounts, assign permissions and configure login methods.

## Access

Navigate to **Users** in the sidebar. You need the **Manage Users** permission.

<!-- TODO: Add screenshot of user list -->

## Features

### User List

The user list shows all registered users with:

- Username and email
- Login method (password or SSO provider)
- System permissions

The list can be searched and paginated.

### User Details

Click on a user to see and edit their details:

- Account information (username, email)
- Login methods (local password, SSO links)
- System permissions
- Linked NFC cards

### Login Methods

Each user can have multiple login methods:

| Method | Description |
|--------|-------------|
| **Local Password** | Username/email and password |
| **SSO (OIDC)** | Login via an OIDC provider |
| **SSO (SAML)** | Login via a SAML provider |
| **TOTP** | Two-factor authentication as add-on |

## Next Steps

- [Creating Users](user-management/creating-users.md)
- [Permissions](user-management/permissions.md)
- [SSO Setup](user-management/sso-overview.md)
- [Two-Factor Authentication](user-management/two-factor-auth.md)
