# System Settings

<!-- llms-description: Administrator overview of System Settings: application settings, machine list visibility, resource activity visibility, email and additional settings. -->

The System Settings page lets administrators configure core application behavior. Access it from **Settings** in the sidebar.

## Accessing Settings

1. Click **Settings** in the sidebar
2. The settings page opens with all configuration sections

> [!NOTE]
> You need the **Manage System Configuration** permission to access system settings. See [Permissions](user-management/permissions.md).

<!-- TODO: Screenshot of settings page -->

## Application Settings

General settings for the Attraccess instance:

| Setting                     | Description                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Application URL**         | The URL where users access Attraccess. Email links are built from it.                                                                                                                                                                                                                                   |
| **Public Internet URL**     | Public URL for external callbacks, such as payment providers. Only needed if it differs from the application URL.                                                                                                                                                                                       |
| **License Key**             | Your Attraccess license key.                                                                                                                                                                                                                                                                            |
| **Default system language** | German or English as the fallback for translated content. A supported user preference or browser language takes precedence. Attractap uses the cardholder’s supported language during a session and the system fallback otherwise. Selected during first-time setup; administrators can change it here. |

> [!TIP]
> Most settings can also be configured via [environment variables](installation/environment-variables.md). Settings changed in the UI override environment variable defaults.

## Machine List Visibility

Under **General**, **Who can see the machine list** controls who sees which machines exist. Changing it requires the **Manage System Settings** (`system.settings.manage`) permission, and every change is recorded in the [audit log](settings/audit-log.md).

| Option                                  | Who sees a machine                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Everyone with Read Resources**        | Everyone with the **Read Resources** (`resources.read`) permission sees all machines.                                                                                                                       |
| **Only people introduced to a machine** | People see only the machines they are introduced to (directly or through a group), introduce or maintain (directly or through a group), or currently use. Nobody else learns that the other machines exist. |

Defaults:

- **Fresh installations** start with **Only people introduced to a machine**. A newly registered account sees an empty machine overview until it is introduced to a machine.
- **Upgraded instances** that already have accounts keep **Everyone with Read Resources** until an administrator changes it. The upgrade stores that value once and never overwrites a value you set.

In both modes:

- You need to be signed in. There is no public mode: signed-out requests get `401` and no data.
- Anyone with **Update Resources** (`resources.update`) or **Manage Resource Access** (`resources.access.manage`) sees all machines.
- An introduction that is blocked until retraining still counts, so people see the machine they have to be retrained on. A revoked introduction hides the machine again. While you run a machine, you see it.
- Accounts without **Read Resources**, for example on custom roles, get the **Only people introduced to a machine** view even in the **Everyone with Read Resources** mode.

A machine hidden from someone answers `404 Not found`, exactly like a machine that does not exist, on every per-machine address: its page, status, usage, introductions, maintenance, flows, forms and live updates. Lists, the in-use list, resource groups, the dashboard and live updates leave it out, and page counts count only the machines you may see. Resource groups appear only if they contain a machine you may see or you introduce or maintain the group.

Activity visibility (above) is applied on top: a machine you cannot see never shows up in the in-use list or live updates, whatever the activity setting says.

> [!WARNING]
> Plugin pages and feeds, for example the reservations plugin, are not covered yet and may still list machines by name. Review the plugins you run before relying on this setting to hide your equipment list.

> [!NOTE]
> Kiosk accounts and printed QR labels open machine pages as a normal account. Under **Only people introduced to a machine**, a kiosk account needs introductions or the **Update Resources** / **Manage Resource Access** permission, and a member who scans a label for a machine they are not introduced to sees the not-found page.

The setting is cached for up to one minute per API instance, so another instance of a multi-instance deployment may apply a change a minute later.

## Resource Activity Visibility

Under **General**, **Who can see resource activity** controls who sees which resources are in use and by whom. Changing it requires the **Manage System Settings** (`system.settings.manage`) permission, and every change is recorded in the [audit log](settings/audit-log.md).

| Option                                     | Who sees a resource's activity                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Everyone with Read Resources** (default) | Everyone with the **Read Resources** (`resources.read`) permission.                                                                                                                                                    |
| **Only people introduced to the resource** | People introduced to the resource (directly or through a group), its introducers and maintainers, and anyone with **Update Resources** (`resources.update`) or **Manage Resource Access** (`resources.access.manage`). |

In both modes:

- You need to be signed in. Signed-out requests get `401` and no data.
- You always see your own running session, and live updates stay open while you run it, showing only that session.
- The names of a resource's introducers and maintainers stay visible to everyone with **Read Resources**, so people who are not yet introduced know who to ask. Email addresses are never shown.

With **Only people introduced to the resource**, everyone else still sees the resource in the catalog, but without activity: it has no entry in the in-use list, status requests answer `403`, and live updates for it are refused. On resources that allow or require [supervised use](resources/introductions.md#supervision-mode), they see only **Available** or **In Use**, without a name.

The setting is stored in the system settings. Instances that never set it behave as **Everyone with Read Resources**, so upgrading needs no migration.

> [!NOTE]
> Scripts and plugins that read the in-use list, introductions or introducers without signing in no longer work. Sign in with an [API token](developer/api-reference.md) instead. Reading the full introduction and introducer lists, and asking about another user's introducer status, requires **Update Resources**, **Manage Resource Access**, or being an introducer of the resource or its group.

## Email Settings

Configure how Attraccess sends emails:

| Setting            | Description                            |
| ------------------ | -------------------------------------- |
| **SMTP Host**      | Hostname of your email server          |
| **SMTP Port**      | Port number for the SMTP connection    |
| **SMTP Secure**    | Whether to use TLS encryption          |
| **SMTP User**      | Username for authentication            |
| **SMTP Password**  | Password for authentication            |
| **Sender Address** | The "From" address for outgoing emails |

For a detailed email setup guide, see [Email / SMTP](setup/smtp-email.md).

## Additional Settings

Depending on your Attraccess version and installed plugins, additional settings sections may be available:

- **Branding** -- Customize the application appearance. See [Branding](setup/branding.md).
- **Email Templates** -- Customize notification emails. See [Email Templates](setup/email-templates.md).
- **Security** -- Cookie and session settings. See [Security](settings/security.md).

## See Also

- [Environment Variables](installation/environment-variables.md) -- All configuration options
- [First-Time Setup](setup/first-time-setup.md) -- Initial configuration wizard
- [Email / SMTP](setup/smtp-email.md) -- Email server setup
- [Branding](setup/branding.md) -- Customize appearance
- [Security](settings/security.md) -- Cookie and session security
