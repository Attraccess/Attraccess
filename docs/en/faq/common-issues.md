# Common Issues

This page lists frequently encountered problems and their solutions.

## SSO Login Fails

**Symptom:** Clicking the SSO button redirects you to the provider, but after logging in you are not signed into Attraccess, or you see an error.

**Possible causes and solutions:**

| Cause | Solution |
|-------|----------|
| HTTPS not configured | SSO requires HTTPS. Set up SSL/TLS for your Attraccess instance. See [SSL Setup](installation/ssl-setup.md). |
| Wrong callback URL | The callback URL configured in your SSO provider must match your Attraccess URL exactly. Check the provider settings. |
| Clock out of sync | OIDC and SAML tokens are time-sensitive. Make sure the server clock is synchronized (use NTP). |
| Cookie SameSite setting | If set to "strict", SSO redirects may fail. Change the cookie SameSite setting to "lax" in the system settings. |

## Emails Not Sending

**Symptom:** Users do not receive password reset emails, verification emails, or other notifications.

**Possible causes and solutions:**

| Cause | Solution |
|-------|----------|
| SMTP not configured | Configure your SMTP settings in the admin panel. See [Email / SMTP](setup/smtp-email.md). |
| Wrong SMTP credentials | Verify the SMTP host, port, username, and password are correct. |
| Firewall blocking | Make sure your server can reach the SMTP server on the configured port (typically 587 or 465). |
| Emails in spam | Check the recipient's spam/junk folder. |

> [!TIP]
> For testing, you can use [Mailpit](https://mailpit.axllent.org/) as a local email testing tool to verify that Attraccess is sending emails correctly.

## Cannot Access a Resource

**Symptom:** You see a resource but cannot start a usage session.

**Possible causes and solutions:**

| Cause | Solution |
|-------|----------|
| Not introduced | You need a safety introduction before you can use the resource. Ask an authorized introducer at your workshop. |
| Resource under maintenance | The resource may be temporarily unavailable for maintenance. Check the resource status on the detail page. |
| Resource in use | Someone else may be using the resource. Wait until their session ends. |

## Forgot Password

**Symptom:** You cannot log in because you forgot your password.

**Solution:**

1. Click **Forgot Password** on the login page
2. Enter your email address
3. Check your email for a reset link
4. Set a new password

If you do not receive the reset email, contact your workshop administrator. They can reset your password for you.

## NFC Card Not Recognized

**Symptom:** Holding your NFC card to the Attractap reader does not work.

**Possible causes and solutions:**

| Cause | Solution |
|-------|----------|
| Card not registered | Make sure your NFC card is registered in Attraccess. Check under **My Account > NFC Cards** or ask your administrator. |
| Reader offline | The Attractap reader may be disconnected or offline. Check that its status LED indicates a connection. |
| Wrong card type | Only compatible NFC cards work with the Attractap reader. Contact your administrator for a compatible card. |
| Card damaged | The NFC chip in the card may be damaged. Try a different card or ask for a replacement. |

## Database Issues

**Symptom:** Attraccess fails to start or shows database errors.

**Possible causes and solutions:**

| Cause | Solution |
|-------|----------|
| Storage permissions | Make sure the `storage/` directory (or Docker volume) has the correct read/write permissions. |
| Disk full | Check that the server has enough free disk space for the SQLite database file. |
| Corrupted database | Restore from a backup. See [Backup & Restore](installation/backup-restore.md). |

## See Also

- [Glossary](faq/glossary.md) – Terminology used in Attraccess
- [Email / SMTP](setup/smtp-email.md) – Email configuration
- [SSL Setup](installation/ssl-setup.md) – HTTPS configuration
- [SSO Overview](user-management/sso-overview.md) – Single Sign-On setup
