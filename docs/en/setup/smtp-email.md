# Email / SMTP Configuration

Attraccess needs an email server (SMTP) to send emails – for example, for account verification, password resets and invitations.

## Configure Settings

Navigate to **Settings** in the sidebar and open the **Email** section.

### SMTP Server

| Field | Description | Example |
|-------|-------------|---------|
| **Service** | `SMTP` or `Outlook365` | `SMTP` |
| **Host** | SMTP server hostname | `smtp.gmail.com` |
| **Port** | SMTP port | `587` |
| **Secure** | Enable TLS | `true` |
| **User** | Login name | `user@example.com` |
| **Password** | SMTP password | |
| **From** | Sender address | `no-reply@example.com` |

### Microsoft Outlook 365

Select `Outlook365` as the service. Host, port and secure are set automatically:
- Host: `smtp.office365.com`
- Port: `587`

You only need to provide user, password and sender address.

## Common SMTP Providers

| Provider | Host | Port | Secure |
|----------|------|------|--------|
| Gmail | `smtp.gmail.com` | `587` | Yes |
| Outlook/Office365 | `smtp.office365.com` | `587` | Yes |
| Mailgun | `smtp.mailgun.org` | `587` | Yes |
| SendGrid | `smtp.sendgrid.net` | `587` | Yes |

> [!TIP]
> With Gmail, you may need to create an **App Password** if two-factor authentication is enabled.

## Local Testing with Mailpit

For testing, you can use [Mailpit](https://github.com/axllent/mailpit) as a local email server:

```yaml
services:
  mailpit:
    image: axllent/mailpit
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web interface
```

Then use these SMTP settings:
- Host: `mailpit`
- Port: `1025`
- Secure: `false`
- No user/password needed

The web interface at `http://your-server:8025` shows all sent emails.

## See Also

- [First-Time Setup](setup/first-time-setup.md)
- [Email Templates](setup/email-templates.md)
- [Environment Variables](installation/environment-variables.md)
