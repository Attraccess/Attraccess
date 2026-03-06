# Setup Wizard

When you start Attraccess for the first time and no user account exists yet, you are automatically redirected to the setup wizard. It guides you through the basic configuration in four steps.

## Step 1: Application Settings

<!-- TODO: Add screenshot of step 1 -->

| Field | Description |
|-------|-------------|
| **URL** | The address where users access Attraccess (e.g. `https://attraccess.your-domain.com`). Automatically pre-filled with the current browser address. |
| **Public Internet URL** | Optional. Only needed if external services (e.g. payment providers) reach Attraccess via a different URL than your users. |
| **License Key** | Your Attraccess license key. You receive this upon registration. |

> [!NOTE]
> The URL is important for redirects after SSO login and for links in emails. Make sure it is correct.

## Step 2: Email Settings

<!-- TODO: Add screenshot of step 2 -->

Attraccess needs an email server to send registration emails, password resets and invitations.

| Field | Description |
|-------|-------------|
| **Service** | `SMTP` (any email server) or `Outlook365` |
| **Host** | Hostname of your SMTP server (e.g. `smtp.gmail.com`) |
| **Port** | SMTP port (typical: `587` for STARTTLS, `465` for SSL) |
| **Secure** | Enable TLS encryption |
| **User** | SMTP login name |
| **Password** | SMTP password |
| **From Address** | The email address that appears as sender |

> [!TIP]
> When selecting `Outlook365`, host, port and secure are set automatically. You only need to provide user, password and sender address.

## Step 3: Create Administrator Account

<!-- TODO: Add screenshot of step 3 -->

Create your first user account. This will be your administrator account.

| Field | Requirement |
|-------|-------------|
| **Username** | 3–32 characters, letters, numbers, underscores, hyphens and dots |
| **Email** | Valid email address |
| **Password** | At least 8 characters |
| **Confirm Password** | Must match the password |

## Step 4: Email Verification

After registration, you will receive a confirmation email. Click the link in the email to verify your account.

After that, you can log in and start configuring Attraccess.

## After First-Time Setup

The setup wizard is only available as long as no user account exists. After completion, you can change the settings at any time under **Settings** in the sidebar.

Recommended next steps:

1. [Customize email templates](setup/email-templates.md)
2. [Create more users](user-management/creating-users.md)
3. [Create your first resource](resources/creating-resources.md)
4. [Set up SSO](user-management/sso-overview.md) (optional)
