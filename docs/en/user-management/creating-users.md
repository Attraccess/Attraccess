# Creating Users

<!-- llms-description: The ways users get an account: self-registration, SSO registration, project invitations and creation by an administrator, and what an account can reach before its email is verified. -->

There are several ways to create new users in Attraccess.

## Self-Registration

Users can register themselves on the login page:

1. Open the Attraccess login page
2. Click **Register**
3. Enter username, email and password, and optionally your first and last name
4. Confirm the email address via the link sent

Self-registration is open by default: the signup domain whitelist (**Settings** > **Security** > **Allowed signup domains**) is `*`. Remove `*` and list your domains to restrict it, or leave the list empty to disable self-registration. See [Default registration and visibility policy](setup/first-time-setup.md#default-registration-and-visibility-policy).

After registration, the user gets the default `user` role. It holds only **Read Resources**, and what that shows depends on [Machine List Visibility](settings/overview.md#machine-list-visibility): on fresh installations a new account sees only the machines that allow or require supervised use until it is introduced. An administrator must assign [permissions](user-management/permissions.md) for the user to access advanced features.

### What an account can reach before its email is verified

- **Password sign-in and passkey sign-in refuse an account whose email address is not verified.** A self-registered account that has not clicked its link gets no session, so it sees no machines and no data. It can only use the sign-in page's flows that need no account session: verify the email, resend the verification email, change the unverified email address (with its password, not while two-factor authentication is enabled), and reset the password.
- **SSO accounts can be unverified.** When the identity provider reports `email_verified=false` and the email address is not yet taken, the first sign-in still creates the account with an unverified email and signs it in. It has the default `user` role like any other account, plus any roles your [permission mapping](user-management/sso-overview.md#permission-mapping) grants: with **Everyone with Read Resources** it sees all machines, with **Only people introduced to a machine** only the machines that allow or require supervised use until it is introduced.
- **Changing the email address clears the verified flag, but existing sessions, API tokens and MCP tokens keep working.** This applies to a change by the user and by an administrator. Password and passkey sign-in is refused again on the next sign-in until the new address is verified; SSO sign-in is not affected.

These rules describe the current behaviour; they are not changed by the machine list visibility setting.

## SSO Registration

If an [SSO provider](user-management/sso-overview.md) is configured, users can log in via the SSO provider. An account is automatically created on first login. First and last name come from the identity provider (see [SSO OIDC](user-management/sso-oidc.md#names)) and are updated on every login.

## Project Invitations

Users can be invited to Attraccess via [project invitations](projects/team-management.md). They receive an email with an invitation link.

## Names

First and last name are optional everywhere an account is created: self-registration, first-time setup, single invitations, CSV invitations and creation by an administrator. Where a name is set, Attraccess shows "First Last" instead of the username (for example in lists, search, emails, notifications and on the reader); the username appears as secondary text where there is room. Without a name, the username is shown as before. Each name has at most 100 characters; blank values are stored as not set. Users change their own name under **My Account**, administrators under **Users** > the user > **Profile**.

## CSV Invitations

When you invite users from a CSV file, map the columns for username, email and, optionally, **first name** and **last name** in the field mapping. The preview shows the mapped names. Rows without a name column value create users without a name.

## Creating Users as Administrator

As an administrator with the **Manage Users** permission, you can manage users in the [User Management](user-management/overview.md) section.

## See Also

- [Permissions](user-management/permissions.md)
- [SSO Overview](user-management/sso-overview.md)
- [First-Time Setup](setup/first-time-setup.md)
