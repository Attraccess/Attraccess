# OIDC Setup

OpenID Connect (OIDC) is the recommended SSO protocol for most use cases.

## Prerequisites

- [HTTPS configured](installation/ssl-setup.md)
- An OIDC-capable identity provider (e.g. Authentik, Keycloak, Azure AD)
- **Manage System Configuration** permission

## Creating a Provider

1. Navigate to **SSO Providers** in the sidebar
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

## Callback URL

Enter the following callback URL in your OIDC provider:

```
https://your-attraccess-url.com/api/auth/sso/OIDC/{provider-id}/callback
```

The provider ID is shown after creating the provider.

## Testing

1. Log out
2. On the login page, a button for your SSO provider should appear
3. Click it and log in at your identity provider
4. You will be automatically redirected back to Attraccess

## See Also

- [SSO Overview](user-management/sso-overview.md)
- [SAML Setup](user-management/sso-saml.md)
- [Permissions](user-management/permissions.md)
