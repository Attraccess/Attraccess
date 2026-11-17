# Permissions

<!-- llms-description: Explains the role-based permission model, default roles, permission keys, plugin-declared permissions, assigning roles and SSO-managed roles. -->

Attraccess uses a **role-based access control (RBAC)** model. Permissions are not assigned to users directly — instead, users are assigned **roles**, and each role grants a set of granular permissions.

## How it works

```
User → assigned Roles → Roles contain Permissions → Guards check Permissions
```

A user's effective permissions are the union of all permissions granted by their assigned roles. Authorization guards always check individual permission keys (e.g. `resources.update`), never role names directly.

## Default Roles

These system-managed roles come pre-installed and cannot be deleted:

| Role                     | Key                | Permissions granted                                                      |
| ------------------------ | ------------------ | ------------------------------------------------------------------------ |
| **User**                 | `user`             | `resources.read` — granted to every user by default                      |
| **Resource Manager**     | `resource-manager` | Create, update, delete resources; manage resource access and maintenance |
| **User Manager**         | `user-manager`     | Read, create, update, delete users; manage role assignments              |
| **System Administrator** | `system-admin`     | Manage system settings, SSO providers, and plugins                       |
| **Billing Manager**      | `billing-manager`  | Read and manage billing configuration and transactions                   |
| **Administrator**        | `administrator`    | All permissions, including every available plugin permission             |

## Permission Keys

| Category  | Key                            | Description                                                            |
| --------- | ------------------------------ | ---------------------------------------------------------------------- |
| resources | `resources.read`               | View resource information                                              |
| resources | `resources.create`             | Create new resources                                                   |
| resources | `resources.update`             | Update existing resources                                              |
| resources | `resources.delete`             | Delete resources                                                       |
| resources | `resources.access.manage`      | Manage who can access resources (introductions)                        |
| resources | `resources.maintenance.manage` | Manage resource maintenance schedules and requests                     |
| resources | `resources.reports.export`     | Export resource session and operating duration reports                 |
| users     | `users.read`                   | View user information                                                  |
| users     | `users.create`                 | Create users                                                           |
| users     | `users.update`                 | Update user accounts                                                   |
| users     | `users.delete`                 | Delete users                                                           |
| users     | `users.roles.manage`           | Assign and revoke roles for users                                      |
| users     | `users.api-tokens.manage`      | Create, view, update and revoke personal API tokens                    |
| users     | `users.rfid-cards.manage`      | View, enroll, activate, deactivate, and delete RFID cards for any user |
| system    | `system.settings.manage`       | Change system configuration                                            |
| system    | `system.audit.read`            | Read the audit log                                                     |
| system    | `system.sso.manage`            | Manage SSO provider configuration                                      |
| system    | `system.plugins.manage`        | Install and configure plugins                                          |
| billing   | `billing.read`                 | View billing information                                               |
| billing   | `billing.manage`               | Manage billing configuration and transactions                          |

## Plugin Permissions

Plugins can declare their own permission keys, for example `matter.devices.read` for the Matter plugin or
`rabbitmq.broker.manage` for the RabbitMQ plugin. They appear in the role editor and the API-token picker in a
separate group per plugin, after the core categories, labelled in your language. You grant them through roles like
core keys; SSO users receive them through their mapped roles.

- **Administrator** always holds every plugin key.
- When a plugin is installed for the first time, it may grant its keys to some system roles (for example
  **Resource Manager**). This happens only once: if you later remove such a key from a role, it stays removed.
- Custom roles never receive plugin keys automatically. Add them to a custom role yourself.

Which keys a plugin declares and what they allow is documented with the plugin, for example
[Matter permissions](plugins/matter/permissions.md).

### When a plugin is uninstalled or fails to load

When a plugin is uninstalled, quarantined or fails to load, or a newer version drops a key, its keys are
**unavailable**: they are hidden from the role editor and the API-token picker and grant nothing. Roles and API
tokens keep their grants, and editing a role or a token does not remove the hidden ones. When the plugin is loaded
again, its keys and all grants come back. Uninstalling an uploaded plugin deletes the plugin's data, but not its
permissions and grants.

### Two-factor authentication

Every key outside `resources.*` marks its holder as a **privileged** user for two-factor authentication. Plugin keys
are no exception: if your two-factor policy applies to privileged users, granting a plugin key (for example a Matter
key to a Resource Manager) requires that user to set up two-factor authentication.

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
