# Permissions

Attraccess uses a permission system with four system permissions that administrators can assign to individual users.

## System Permissions

| Permission | Description |
|-----------|-------------|
| **Manage Resources** | Create, edit and delete resources. Manage maintenance and introductions. |
| **Manage System Configuration** | Configure system settings, SSO providers and email templates. |
| **Manage Users** | Manage user accounts and their permissions. |
| **Manage Billing** | Manage billing configuration and transactions. |

## Assigning Permissions

1. Navigate to **Users** in the sidebar
2. Select a user
3. Enable or disable the desired permissions
4. Save the changes

<!-- TODO: Add screenshot of permission settings -->

## SSO-Managed Permissions

If a user is logged in via [SSO](user-management/sso-overview.md) and the SSO provider has [permission mappings](user-management/sso-oidc.md) configured, some permissions are automatically controlled by the SSO provider.

In this case:
- The affected toggles are disabled (grayed out)
- A notice shows which SSO provider manages the permission
- Changes must be made through the SSO provider

## Permissions Without Admin Role

Even without system permissions, users can:

- Log in and manage their account
- View resources they have been introduced to
- Use resources (start/stop sessions)
- Participate in projects they have been invited to

## See Also

- [User Management](user-management/overview.md)
- [SSO Overview](user-management/sso-overview.md)
- [Introductions](resources/introductions.md) – Resource-level permissions
