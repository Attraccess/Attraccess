# Creating Users
<!-- llms-description: The ways users get an account: self-registration, SSO registration, project invitations and creation by an administrator. -->

There are several ways to create new users in Attraccess.

## Self-Registration

Users can register themselves on the login page:

1. Open the Attraccess login page
2. Click **Register**
3. Enter username, email and password, and optionally your first and last name
4. Confirm the email address via the link sent

After registration, the user has no system permissions by default. An administrator must assign [permissions](user-management/permissions.md) for the user to access advanced features.

## SSO Registration

If an [SSO provider](user-management/sso-overview.md) is configured, users can log in via the SSO provider. An account is automatically created on first login. First and last name come from the identity provider (see [SSO OIDC](user-management/sso-oidc.md#names)) and are updated on every login.

## Project Invitations

Users can be invited to Attraccess via [project invitations](projects/team-management.md). They receive an email with an invitation link.

## Names

First and last name are optional everywhere an account is created: self-registration, first-time setup, single invitations, CSV invitations and creation by an administrator. Where a name is set, Attraccess shows "First Last" instead of the username (for example in lists, search, emails, notifications and on the reader); the username appears as secondary text where there is room. Without a name, the username is shown as before. Each name has at most 100 characters; blank values are stored as empty. Users change their own name under **My Account**, administrators under **Users** > the user > **Profile**.

## CSV Invitations

When you invite users from a CSV file, map the columns for username, email and, optionally, **first name** and **last name** in the field mapping. The preview shows the mapped names. Rows without a name column value create users without a name.

## Creating Users as Administrator

As an administrator with the **Manage Users** permission, you can manage users in the [User Management](user-management/overview.md) section.

## See Also

- [Permissions](user-management/permissions.md)
- [SSO Overview](user-management/sso-overview.md)
- [First-Time Setup](setup/first-time-setup.md)
