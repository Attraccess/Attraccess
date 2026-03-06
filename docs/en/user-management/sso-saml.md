# SAML Setup

SAML (Security Assertion Markup Language) is commonly used in enterprise and educational environments.

## Prerequisites

- [HTTPS configured](installation/ssl-setup.md)
- A SAML-capable identity provider
- **Manage System Configuration** permission

## Creating a Provider

1. Navigate to **SSO Providers** in the sidebar
2. Click **Add New Provider**
3. Select **SAML** as the type
4. Enter a name for the provider

## Configuration

| Field | Description |
|-------|-------------|
| **Entry Point** | SSO URL of the identity provider |
| **Issuer** | Service provider identifier (your Attraccess URL) |
| **Certificate** | Identity provider's signing certificate (X.509, PEM format) |

### Signing Options

| Option | Default | Description |
|--------|---------|-------------|
| **Sign Request** | Off | Sign AuthnRequest to the IdP |
| **Want Assertions Signed** | On | IdP must sign assertions |
| **Want AuthnResponse Signed** | On | IdP must sign the entire response |
| **Force Authentication** | Off | Re-authenticate on every login |

> [!NOTE]
> If **Sign Request** is enabled, you must also provide an SP signing certificate and private key.

### Email Attribute

Specify the SAML attribute names that contain the email address. Multiple values are possible (one per line).

Common attribute names:
- `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
- `email`
- `mail`

### Provisioning Secret

Optionally set a provisioning secret. This allows your identity provider to manage users and permissions in Attraccess via the provisioning API.

### Permission Mapping

As with [OIDC](user-management/sso-oidc.md), you can map SAML roles to Attraccess permissions.

## Service Provider Metadata

Configure your SAML identity provider with these values:

| Field | Value |
|-------|-------|
| **ACS URL (Callback)** | `https://your-url.com/api/auth/sso/SAML/{provider-id}/callback` |
| **Entity ID / Issuer** | Your Attraccess URL |
| **Binding** | HTTP-POST |

## Testing

1. Log out
2. Click the SAML provider button on the login page
3. Authenticate at the identity provider
4. You will be automatically redirected back to Attraccess

## See Also

- [SSO Overview](user-management/sso-overview.md)
- [OIDC Setup](user-management/sso-oidc.md)
- [Permissions](user-management/permissions.md)
