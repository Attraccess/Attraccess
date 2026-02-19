# SSO Providers

Attraccess can federate authentication through externally managed identity providers.  
Administrators manage providers under **Settings → Authentication → SSO Providers**. Every
provider record stores the metadata required for the API to redirect the browser to the
IdP, validate the returned response, and mint an Attraccess session token.

## Supported provider types

| Type     | Use cases                                                     | Required data                                                                                                   |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **OIDC** | Authentik, Keycloak, Azure AD, etc.                           | Issuer, authorization/token/user-info URLs, client credentials, optional scopes & claim hints                   |
| **SAML** | Legacy enterprise IdPs (Keycloak SAML clients, ADFS, Okta, …) | Entry point URL, SP issuer, ACS override (optional), IdP signing certificate, optional audience & signing flags |

## Creating a provider

1. Open the admin UI and click **Add New Provider**.
2. Choose a type (`OIDC` or `SAML`). The form adapts to the required fields.
3. Fill the configuration fields (see sections below) and press **Save**.
4. Copy the generated login URL (displayed on the Unauthorized login screen) into your IdP
   as the Assertion Consumer / Redirect URI.

## OIDC specifics

- Use the **Auto-Discovery** menu to fetch metadata from Authentik or Keycloak – issuer and
  endpoint URLs are filled automatically.
- Authentik requires regex mode for redirect URI matching if you use the `redirectTo` query
  parameter. Use a pattern like:
  `^http://localhost:3000/api/auth/sso/OIDC/1/callback(\\?.*)?$` (replace host and provider ID).
- `Scopes`, `Username claim paths`, and `Email claim paths` accept comma-separated lists and
  are evaluated in order. They allow you to prioritise custom claim names if your IdP does
  not populate the defaults (`preferred_username`, `email`, `sub`, …).

## SAML specifics

- **Entry Point**: the IdP SSO URL (e.g. `https://keycloak.local/realms/master/protocol/saml`).
- **Issuer**: the Service Provider entity ID that Attraccess presents to the IdP. Most IdPs
  expect the public API URL (`https://api.attraccess.org`).
- **Callback URL**: optional override for the Assertion Consumer Service (ACS). When left
  blank, the API URL automatically becomes `/api/auth/sso/SAML/:providerId/callback`.
- **Certificate**: paste the IdP signing certificate **without** `-----BEGIN CERTIFICATE-----`
  or `-----END CERTIFICATE-----` markers; only the base64 payload is required.
- **Audience**: optional restriction that must match the `Audience` inside assertions. Leave
  empty to accept the default (`issuer`).
- **Signing flags**:
  - _Sign AuthnRequests_: future-proof switch (requests are still sent unsigned unless a SP
    key is configured).
  - _Require signed assertions / responses_: mirror your IdP behaviour; leave responses signed
    for production.
  - _Force re-authentication_: sets the `ForceAuthn` flag so the IdP cannot reuse an existing
    session.

After saving, users see a “Login with {provider name}” button on the Unauthorized screen.
The button simply points the browser to
`{API_URL}/api/auth/sso/{TYPE}/{PROVIDER_ID}/login?redirectTo={currentLocation}` so you can
deep-link into custom portals as needed.
