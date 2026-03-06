# Auth & SSO Research

## System Permissions (4 total)
- `canManageResources` - Manage resources
- `canManageSystemConfiguration` - Manage system/SSO settings
- `canManageUsers` - Manage users and permissions
- `canManageBilling` - Manage billing and credits

## Authentication Types
- LOCAL_PASSWORD - Username/email + password
- SSO - OIDC or SAML via configured provider
- TOTP - Two-factor authentication (add-on to above)

## SSO Provider Types
- OIDC: issuer, authURL, tokenURL, userInfoURL, clientId, clientSecret, scopes, claim paths
- SAML: entryPoint, issuer, certificate, signing options, email attribute keys, provisioning secret

## SSO Features
- Multi-provider support
- Claim path mapping (username, email)
- Permission mapping (role names → system permissions)
- Account linking (local → SSO)
- Provisioning API (IdP pushes user/permission updates)
- Discovery helpers: Authentik, Keycloak, OpenID Configuration auto-fill
