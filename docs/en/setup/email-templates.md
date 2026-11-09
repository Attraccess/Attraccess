# Email Templates
<!-- llms-description: Manage and customize the email templates Attraccess sends, including available templates, plugin templates and placeholders. -->

Attraccess uses email templates for automated messages such as registration confirmations and password resets. You can customize these templates for your organization.

## Managing Templates

Open **Settings** in the sidebar, select the **Email** section and open **Templates**. You need the **Manage System Configuration** permission.

<!-- TODO: Add screenshot of email templates page -->

## Available Templates

Attraccess includes default templates for:

- **Registration Confirmation** – Sent after account creation
- **Password Reset** – Link to reset the password
- **Email Verification** – Email address confirmation
- **Project Invitation** – Invitation to a project

## Plugin Templates

Plugins can bring their own email templates (the reservations plugin, for example, for booking confirmations and
reminders). They appear in the same list after the core templates, marked with a **Plugin: &lt;name&gt;** chip, and
are edited and translated the same way. Once a plugin template is stored, it is yours: plugin upgrades leave your
version unchanged, so new default texts of a plugin update do not overwrite it. Use **Reset to Default** to switch to
the plugin's current default texts and translations.

## Editing Templates

1. Select a template from the list
2. Edit the subject and content
3. Use placeholders for dynamic content
4. Save the changes

## Placeholders

Templates support placeholders that are automatically replaced when sending:

| Placeholder | Description |
|-------------|-------------|
| `{{username}}` | Recipient's username |
| `{{email}}` | Recipient's email address |
| `{{link}}` | Action link (confirmation, reset, etc.) |
| `{{appName}}` | Application name |

## See Also

- [Email / SMTP](setup/smtp-email.md)
- [First-Time Setup](setup/first-time-setup.md)
