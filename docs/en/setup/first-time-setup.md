# Setup Wizard
<!-- llms-description: Walks through the first-run setup wizard: application settings, email settings, administrator account, email verification and the default registration and machine visibility policy. -->

When you start Attraccess for the first time and no user account exists yet, you are automatically redirected to the setup wizard. It guides you through the basic configuration in four steps.

## Step 1: Application Settings

<!-- TODO: Add screenshot of step 1 -->

| Field | Description |
|-------|-------------|
| **URL** | The address where users access Attraccess (e.g. `https://attraccess.your-domain.com`). Automatically pre-filled with the current browser address. |
| **Public Internet URL** | Optional. Only needed if external services (e.g. payment providers) reach Attraccess via a different URL than your users. |
| **License Key** | Your Attraccess license key, including the special key for qualifying non-commercial use. See [Activation](getting-started/overview.md#activation). |

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

## Default registration and visibility policy

Decide these before you open the instance to people. The defaults and what follows from them for data protection:

| Policy                      | Default                                                                                                                                                                                      | Where to change it                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Self-registration**       | Open. The signup domain whitelist is `*`, so anyone can create an account with any email address. Remove `*` and list your domains to restrict it; an empty list disables self-registration. | **Settings** > **Security** > **Allowed signup domains**      |
| **Machine list visibility** | **Only people introduced to a machine** on fresh installations. Instances upgraded from an earlier version keep **Everyone with Read Resources** until an administrator changes it.          | **Settings** > **General** > **Who can see the machine list** |

Every new account gets the default `user` role, which holds **Read Resources** only. What that account sees depends on the machine list visibility:

- With **Only people introduced to a machine**, a new account sees no machines until someone introduces it. Equipment you own stays unknown to outsiders.
- With **Everyone with Read Resources** and open self-registration, anyone can create an account and read your whole equipment list. That tells outsiders which machines your space holds, and which it does not. Treat this as personal and operational data you are responsible for: restrict the signup domains, or switch to **Only people introduced to a machine**.

See [Machine List Visibility](settings/overview.md#machine-list-visibility) for the exact rules, and [Creating Users](user-management/creating-users.md#what-an-account-can-reach-before-its-email-is-verified) for what an account can do before it verifies its email address.

## After First-Time Setup

The setup wizard is only available as long as no user account exists. After completion, you can change the settings at any time under **Settings** in the sidebar.

Recommended next steps:

1. [Customize email templates](setup/email-templates.md)
2. [Create more users](user-management/creating-users.md)
3. [Create your first resource](resources/creating-resources.md)
4. [Set up SSO](user-management/sso-overview.md) (optional)
