# Single Sign-On (SSO)

Attraccess supports Single Sign-On (SSO) via two protocols: **OpenID Connect (OIDC)** and **SAML**. This allows your users to log in with their existing organizational account.

## Prerequisites

- [HTTPS must be configured](installation/ssl-setup.md) (SSO providers require secure connections)
- SSO module must be included in your license
- **Manage System Configuration** permission

## Supported Protocols

| Protocol | Use Case | Example Providers |
|----------|----------|-------------------|
| **OIDC** | Modern web applications | Authentik, Keycloak, Azure AD, Google Workspace |
| **SAML** | Enterprise and educational institutions | Authentik, Keycloak, Azure AD, Shibboleth |

## Configuring Providers

1. Navigate to **SSO Providers** in the sidebar
2. Click **Add New Provider**
3. Select the type (OIDC or SAML)
4. Fill in the configuration

Detailed guides:
- [OIDC Setup](user-management/sso-oidc.md)
- [SAML Setup](user-management/sso-saml.md)

## Auto-Discovery

Attraccess offers auto-discovery for common OIDC providers:

- **Authentik** – Enter host and application name
- **Keycloak** – Enter host and realm
- **OpenID Configuration** – Enter the `.well-known/openid-configuration` URL

Discovery automatically fills in all URL fields (Issuer, Authorization, Token, UserInfo).

## Permission Mapping

SSO providers can automatically control user permissions. If your provider passes roles or groups, you can map them to the four Attraccess [system permissions](user-management/permissions.md).

Example: The OIDC role `attraccess_admin` is mapped to the **Manage Users** permission.

## Account Linking

If a user already has a local account and logs in via SSO for the first time, the existing account can be linked to the SSO provider. The user's email address and local password are requested for verification.

## Multiple Providers

You can configure multiple SSO providers simultaneously. Users see buttons for each configured provider on the login page.

## See Also

- [OIDC Setup](user-management/sso-oidc.md)
- [SAML Setup](user-management/sso-saml.md)
- [Permissions](user-management/permissions.md)
- [SSL Setup](installation/ssl-setup.md)
