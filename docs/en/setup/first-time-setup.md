# Setup Wizard
<!-- llms-description: The five-step setup wizard (application and email settings, license, administrator account, email verification) and the default registration and machine visibility policy. -->

When you start Attraccess for the first time and no user account exists yet, you are automatically redirected to the setup wizard. It guides you through the basic configuration in five steps.

## Step 1: Application Settings

<!-- TODO: Add screenshot of step 1 -->

| Field | Description |
|-------|-------------|
| **Application URL** | The address where users access Attraccess (e.g. `https://attraccess.your-domain.com`). Automatically pre-filled with the current browser address. |
| **Public Internet URL** | Optional. Only needed if external services (e.g. payment providers) reach Attraccess via a different URL than your users. |
| **Default system language** | German or English as the fallback for translated content. |

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

## Step 3: License

<!-- TODO: Add screenshot of step 3 -->

Activating licensed features requires a license key, including for free installations. See [Activation](getting-started/overview.md#activation).

- **Private users and non-profit organizations:** click **Use community / non-profit license** and confirm the dialog that asks whether you qualify and agree to the Prosperity Public License terms. The key is filled in for you.
- **Commercial users:** paste your paid license key into the **License Key** field.

Then click **Save license**. If the key changes which plugins may load, the server restarts automatically.

## Step 4: Create Administrator Account

<!-- TODO: Add screenshot of step 4 -->

Create your first user account. This will be your administrator account.

| Field | Requirement |
|-------|-------------|
| **Username** | 3–32 characters, letters, numbers, underscores, hyphens and dots |
| **Email address** | Valid email address |
| **First name / Last name** | Optional |
| **Password** | 12 to 128 characters, must not contain your username or a part of your email address (only usernames and parts with at least four characters are checked), and must be hard enough to guess (the wizard shows a strength indicator and can generate a strong password) |
| **Confirm password** | Must match the password |

## Step 5: You're All Set

After registration, you will receive a confirmation email. Click the link in the email to verify your account. If you entered something wrong, use the link in this step to correct your administrator details.

After that, you can log in and start configuring Attraccess.

## Default registration and visibility policy

Decide these before you open the instance to people. The defaults and what follows from them for data protection:

| Policy                      | Default                                                                                                                                                                                      | Where to change it                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Self-registration**       | Open. The signup domain whitelist is `*`, so anyone can create an account with any email address. Remove `*` and list your domains to restrict it; an empty list disables self-registration. | **Settings** > **Security** > **Allowed signup domains**      |
| **Machine list visibility** | **Only people introduced to a machine** on fresh installations. Instances upgraded from an earlier version keep **Everyone with Read Resources** until an administrator changes it.          | **Settings** > **General** > **Who can see the machine list** |

Every new account gets the default `user` role, which holds **Read Resources** only. What that account sees depends on the machine list visibility:

- With **Only people introduced to a machine**, a new account sees only the machines that allow or require supervised use until someone introduces it. Other equipment you own stays unknown to outsiders.
- With **Everyone with Read Resources** and open self-registration, anyone can create an account and read your whole equipment list. That tells outsiders which machines your space holds, and which it does not. Treat the equipment list as operational information you are responsible for protecting: restrict the signup domains, or switch to **Only people introduced to a machine**.

See [Machine List Visibility](settings/overview.md#machine-list-visibility) for the exact rules, and [Creating Users](user-management/creating-users.md#what-an-account-can-reach-before-its-email-is-verified) for what an account can do before it verifies its email address.

## After First-Time Setup

The setup wizard stays available until the administrator's email address is verified. Once the administrator account exists, you can still correct its details there, but the wizard no longer saves application, email or license settings. After verification, you can change the settings at any time under **Settings** in the sidebar.

Recommended next steps:

1. [Customize email templates](setup/email-templates.md)
2. [Create more users](user-management/creating-users.md)
3. [Create your first resource](resources/creating-resources.md)
4. [Set up SSO](user-management/sso-overview.md) (optional)
