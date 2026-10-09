# OIDC Setup

OpenID Connect (OIDC) is the recommended SSO protocol for most use cases.

## Prerequisites

- [HTTPS configured](installation/ssl-setup.md)
- An OIDC-capable identity provider (e.g. Authentik, Keycloak, Azure AD)
- **Manage System Configuration** permission

## Creating a Provider

1. Open **Settings** in the sidebar and select the **Single sign-on** section
2. Click **Add New Provider**
3. Select **OIDC** as the type
4. Enter a name for the provider

## Configuration

### Auto-Discovery

For Authentik, Keycloak or other OpenID-compatible providers, you can use auto-discovery:

- **Authentik**: Enter host and application name
- **Keycloak**: Enter host and realm
- **OpenID Configuration**: Enter the `.well-known/openid-configuration` URL

All URL fields are filled in automatically.

### Manual Configuration

| Field | Description | Example |
|-------|-------------|---------|
| **Issuer** | Provider's issuer URL | `https://auth.example.com/application/o/attraccess/` |
| **Authorization URL** | Authorization endpoint | `https://auth.example.com/application/o/authorize/` |
| **Token URL** | Token endpoint | `https://auth.example.com/application/o/token/` |
| **UserInfo URL** | User info endpoint | `https://auth.example.com/application/o/userinfo/` |
| **Client ID** | Client identifier | `attraccess` |
| **Client Secret** | Client secret | (stored encrypted) |

### Scopes

Optionally specify additional OIDC scopes (comma-separated). Default scopes are requested automatically.

### Claim Paths

Attraccess needs to know which fields in the OIDC token contain the username and email address.

| Field | Default | Description |
|-------|---------|-------------|
| **Username Claim Paths** | `preferred_username, email, sub` | Ordered list of token fields for username |
| **Email Claim Paths** | `email, emails[0].value, upn` | Ordered list of token fields for email |

Attraccess checks the paths in the specified order and uses the first match.

### Permission Mapping

Map OIDC roles to Attraccess permissions. For each permission, enter a comma-separated list of role names.

| Permission | Example Roles |
|-----------|---------------|
| **Manage Resources** | `attraccess_resources, admin` |
| **Manage System Configuration** | `attraccess_admin` |
| **Manage Users** | `attraccess_admin, user_manager` |
| **Manage Billing** | `attraccess_billing` |

> [!NOTE]
> Role names are normalized for comparison (lowercase, alphanumeric only). `CanManageUsers` and `canmanageusers` are identical.

### Keycloak Group Mappings

When using Keycloak groups for role mappings, configure a Group Membership mapper that includes the `groups` claim in the ID token or UserInfo response. Attraccess does not read role claims from the access token, so enabling the mapper only for the access token is insufficient.

Keycloak omits the `groups` claim for users with no group memberships. Attraccess preserves existing SSO-granted roles when no role or group claim is present, so removing a user's last mapped group does not revoke that role on their next login. Assign every SSO user a baseline group, such as `attraccess_users`, so the claim remains present and removal of a mapped group can be synchronized.

## Callback URL

Enter the following callback URL in your OIDC provider:

```
https://your-attraccess-url.com/api/auth/sso/OIDC/{provider-id}/callback
```

The provider ID is shown after creating the provider.

> [!IMPORTANT]
> The callback URL must match exactly — do not append query parameters. Attraccess uses the OIDC `state` parameter to track where users should be redirected after login. Make sure your identity provider passes the `state` parameter back unchanged during the callback.

## Testing

1. Log out
2. On the login page, a button for your SSO provider should appear
3. Click it and log in at your identity provider
4. You will be automatically redirected back to Attraccess

## See Also

- [SSO Overview](user-management/sso-overview.md)
- [SAML Setup](user-management/sso-saml.md)
- [Permissions](user-management/permissions.md)

## OIDC central logout

Configure optional **End-session URL** and **JWKS URL**, or leave them empty to use discovery from the configured issuer. Discovered issuer identity must match exactly. Configure the allowed asymmetric signing algorithms; the default is `RS256`. Endpoints require HTTPS in production; HTTP loopback URLs are allowed in local development. Provider metadata requests have bounded time, size, redirects, and cache lifetime. Key URLs in incoming tokens are never trusted.

Register these URLs with the provider, replacing `API_ORIGIN` and `PROVIDER_ID` with the public API address and provider ID. The form shows the exact URLs from application settings:

| Provider setting | URL |
| --- | --- |
| Post-logout redirect URI | `API_ORIGIN/api/auth/sso/OIDC/PROVIDER_ID/post-logout` |
| Back-channel logout URI | `API_ORIGIN/api/auth/sso/OIDC/PROVIDER_ID/backchannel-logout` |
| Front-channel logout URI | `API_ORIGIN/api/auth/sso/OIDC/PROVIDER_ID/frontchannel-logout` |

**Logout everywhere** uses a verified ID-token hint when available and one-time server-side state. Configure the client's post-logout redirect URI exactly. Logout tokens sent by form-encoded POST must be signed, include matching issuer/audience, `iat`, `exp`, `jti`, the back-channel logout event, and `sub` or `sid`. They must not contain a nonce. Notifications must be issued within five minutes (`iat`) and must not be expired (`exp`), allowing 30 seconds of clock skew. The interval between issuance and expiry may exceed five minutes; a fresh token with a one-hour expiry is accepted. When both subject and session ID are supplied, both must match. Duplicate valid tokens succeed without ending newer sessions.

Front-channel notifications accept `iss` and `sid` together. Without them, only the matching current browser session can be ended; a cookieless notification then does nothing. Attraccess cookies use SameSite=Strict, and third-party cookie restrictions can prevent cookie-only notifications from working. Parameter-based notifications do not require cookies. Enable **back-channel logout** for reliable provider notifications. Only the minimal notification endpoint permits iframe embedding; application pages keep their existing frame policy.

Existing sessions without verified SSO correlation remain valid for local login/logout. If provider verification/discovery is unavailable for a legacy configuration, no untrusted ID-token correlation is recorded. Configure trusted JWKS metadata and sign in again to enable central logout.
