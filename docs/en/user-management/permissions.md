# Permissions

Attraccess uses a **role-based access control (RBAC)** model. Permissions are not assigned to users directly — instead, users are assigned **roles**, and each role grants a set of granular permissions.

## How it works

```
User → assigned Roles → Roles contain Permissions → Guards check Permissions
```

A user's effective permissions are the union of all permissions granted by their assigned roles. Authorization guards always check individual permission keys (e.g. `resources.update`), never role names directly.

## Default Roles

These system-managed roles come pre-installed and cannot be deleted:

| Role | Key | Permissions granted |
|------|-----|---------------------|
| **User** | `user` | `resources.read` — granted to every user by default |
| **Resource Manager** | `resource-manager` | Create, update, delete resources; manage resource access and maintenance |
| **User Manager** | `user-manager` | Read, create, update, delete users; manage role assignments |
| **System Administrator** | `system-admin` | Manage system settings, SSO providers, and plugins |
| **Billing Manager** | `billing-manager` | Read and manage billing configuration and transactions |
| **Owner** | `owner` | All permissions |

## Permission Keys

| Category | Key | Description |
|----------|-----|-------------|
| resources | `resources.read` | View resource information |
| resources | `resources.create` | Create new resources |
| resources | `resources.update` | Update existing resources |
| resources | `resources.delete` | Delete resources |
| resources | `resources.access.manage` | Manage who can access resources (introductions) |
| resources | `resources.maintenance.manage` | Manage resource maintenance schedules and requests |
| users | `users.read` | View user information |
| users | `users.create` | Create users |
| users | `users.update` | Update user accounts |
| users | `users.delete` | Delete users |
| users | `users.roles.manage` | Assign and revoke roles for users |
| system | `system.settings.manage` | Change system configuration |
| system | `system.sso.manage` | Manage SSO provider configuration |
| system | `system.plugins.manage` | Install and configure plugins |
| billing | `billing.read` | View billing information |
| billing | `billing.manage` | Manage billing configuration and transactions |

## Assigning Roles

1. Navigate to **Users** in the sidebar
2. Select a user
3. Use the **Roles** section to assign or revoke roles
4. Changes take effect immediately

> Users with the `users.roles.manage` permission can only assign roles whose permissions are a subset of their own effective permissions ("cannot grant what you don't have").

## SSO-Managed Roles

If a user is logged in via [SSO](user-management/sso-overview.md) and the SSO provider has [permission mappings](user-management/sso-oidc.md) configured, roles are automatically synchronised from the SSO provider on each login.

SSO-assigned roles are shown with a provider badge in the user's role list. They cannot be manually revoked while SSO is active — changes must be made through the SSO provider.

## What All Users Can Do

Without any elevated role, every authenticated user can:

- Log in and manage their own account
- View resources they have been introduced to (`resources.read`)
- Start and stop their own usage sessions
- Participate in projects they have been invited to

## See Also

- [User Management](user-management/overview.md)
- [SSO Overview](user-management/sso-overview.md)
- [Introductions](resources/introductions.md) — Resource-level access grants
