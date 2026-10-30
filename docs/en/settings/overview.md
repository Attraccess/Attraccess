# System Settings

The System Settings page lets administrators configure core application behavior. Access it from **Settings** in the sidebar.

## Accessing Settings

1. Click **Settings** in the sidebar
2. The settings page opens with all configuration sections

> [!NOTE]
> You need the **Manage System Configuration** permission to access system settings. See [Permissions](user-management/permissions.md).

<!-- TODO: Screenshot of settings page -->

## Application Settings

General settings for the Attraccess instance:

| Setting | Description |
|---------|-------------|
| **Application URL** | The URL where users access Attraccess (corresponds to `ATTRACCESS_URL`). |
| **Public Internet URL** | Public URL for external callbacks, such as payment providers. Only needed if it differs from the application URL. |
| **License Key** | Your Attraccess license key. |
| **Default system language** | German or English as the fallback for translated content. A supported user preference or browser language takes precedence. Attractap uses the cardholder’s supported language during a session and the system fallback otherwise. Selected during first-time setup; administrators can change it here. |

> [!TIP]
> Most settings can also be configured via [environment variables](installation/environment-variables.md). Settings changed in the UI override environment variable defaults.

## Equipment Activity Visibility

Under **General**, **Who can see equipment activity** controls who sees which machines are in use and by whom. Changing it requires the **Manage System Configuration** permission, and every change is recorded in the [audit log](settings/audit-log.md).

| Option | Who sees a machine's activity |
|--------|-------------------------------|
| **All equipment** (default) | Everyone with the **View resources** permission. |
| **Introduced equipment only** | People who may use the machine (introduced directly or through a group), its introducers and maintainers, and anyone with **Manage resources** or **Manage access**. |

In both modes:

- You need to be signed in. Signed-out requests get `401` and no data.
- You always see your own running session.
- The names of a machine's introducers and maintainers stay visible to everyone with **View resources**, so people who are not yet introduced know who to ask. Email addresses are never shown.

In **Introduced equipment only** mode, everyone else still sees the machine in the catalog, but without activity: it has no entry in the in-use list, status requests answer `403`, and live updates for it are refused. On machines that allow [supervised use](resources/introductions.md), they see only *free* or *in use*, without a name.

The setting is stored in the system settings. Instances that never set it behave as **All equipment**, so upgrading needs no migration.

> [!NOTE]
> Scripts and plugins that read the in-use list, introductions or introducers without signing in no longer work. Sign in with an [API token](developer/api-reference.md) instead. Reading the full introduction and introducer lists, and asking about another user's introducer status, requires **Manage resources**, **Manage access**, or being an introducer of the machine or its group.

## Email Settings

Configure how Attraccess sends emails:

| Setting | Description |
|---------|-------------|
| **SMTP Host** | Hostname of your email server |
| **SMTP Port** | Port number for the SMTP connection |
| **SMTP Secure** | Whether to use TLS encryption |
| **SMTP User** | Username for authentication |
| **SMTP Password** | Password for authentication |
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
