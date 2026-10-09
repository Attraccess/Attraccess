# SAML Setup

SAML (Security Assertion Markup Language) is commonly used in enterprise and educational environments.

## Prerequisites

- [HTTPS configured](installation/ssl-setup.md)
- A SAML-capable identity provider
- **Manage System Configuration** permission

## Creating a Provider

1. Open **Settings** in the sidebar and select the **Single sign-on** section
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

## SAML Single Logout

Set the **Identity Provider entity ID** separately from the existing **Service Provider issuer**. Configure the IdP **logout URL**, IdP signing certificate, and Attraccess signing certificate/private key. The private key is stored encrypted. Every logout exchange requires a signature, even when login assertion/request signing options are disabled.

Register `API_ORIGIN/api/auth/sso/SAML/PROVIDER_ID/slo` as the SP SingleLogoutService URL for **HTTP-Redirect** and **HTTP-POST**. Use the exact API URL shown by the provider form. Trust the Attraccess signing certificate at the IdP. Attraccess sends signed Redirect requests/responses and accepts signed Redirect and POST messages. SOAP and Artifact bindings are not supported.

**Logout everywhere** sends the original NameID, its format and qualifiers, and all captured SessionIndex values. A new SSO login is required for older sessions. Without signing material or usable session correlation, central logout remains disabled and local logout still works.

Incoming requests must match the IdP issuer, destination and fresh timestamps. They revoke matching NameID identities, including qualifiers, limited by any supplied SessionIndex values. With no SessionIndex, all sessions for that provider identity are ended. Responses must match an outstanding, unexpired request and are consumed once. Replayed requests, unsigned messages, invalid signatures and mismatched destinations are rejected. Partial or failed provider logout is reported without restoring the local session or claiming that other applications were logged out.
