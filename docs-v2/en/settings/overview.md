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

> [!TIP]
> Most settings can also be configured via [environment variables](installation/environment-variables.md). Settings changed in the UI override environment variable defaults.

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
