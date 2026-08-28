# Email Templates

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
