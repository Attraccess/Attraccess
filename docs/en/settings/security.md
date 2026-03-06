# Security Settings

Attraccess provides several security-related settings for session cookies and authentication. These settings affect how users stay logged in and how the application handles cross-site requests.

## Cookie SameSite Setting

The **Cookie SameSite** setting controls when the browser sends session cookies along with requests. This is important for security and for SSO compatibility.

| Value | Description |
|-------|-------------|
| **lax** (default) | Cookies are sent with same-site requests and top-level navigations. This is the recommended default. |
| **strict** | Cookies are only sent with same-site requests. More secure, but **breaks SSO login**. |
| **none** | Cookies are sent with all requests, including cross-site. **Requires HTTPS.** |

> [!WARNING]
> Setting Cookie SameSite to **strict** will break SSO (OIDC and SAML) login. When a user is redirected back from the identity provider, the browser does not send the session cookie because the redirect is a cross-site navigation. The login will fail.

> [!WARNING]
> Setting Cookie SameSite to **none** requires HTTPS. If your Attraccess instance uses HTTP, the setting automatically falls back to **lax** and a warning is logged. See [SSL Setup](installation/ssl-setup.md) for configuring HTTPS.

### Recommended Configuration

| Scenario | Recommended SameSite Value |
|----------|---------------------------|
| No SSO, HTTP or HTTPS | `lax` (default) |
| SSO (OIDC/SAML), HTTPS | `lax` (default) |
| Maximum cookie security, no SSO | `strict` |
| Cross-site embedding required, HTTPS | `none` |

## Session Configuration

Session security is controlled via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_SESSION_SECRET` | -- | **Required.** Secret key for encrypting session data. Must be a secure, random value. |
| `SESSION_COOKIE_MAX_AGE` | `604800000` | Maximum session duration in milliseconds (default: 7 days). |

> [!WARNING]
> The `AUTH_SESSION_SECRET` must be a long, random string. A weak or predictable value compromises session security. Generate it with a tool like `openssl rand -hex 32`.

> [!TIP]
> If you change the `AUTH_SESSION_SECRET`, all existing user sessions are invalidated and users must log in again.

## Best Practices

- Always use **HTTPS** in production. See [SSL Setup](installation/ssl-setup.md).
- Keep the default **lax** Cookie SameSite setting unless you have a specific reason to change it.
- Generate a strong `AUTH_SESSION_SECRET` during initial setup and store it securely.
- Adjust `SESSION_COOKIE_MAX_AGE` based on your security requirements. Shorter durations are more secure but require users to log in more frequently.

## See Also

- [Environment Variables](installation/environment-variables.md) -- All configuration options
- [SSL Setup](installation/ssl-setup.md) -- Configure HTTPS
- [SSO Overview](user-management/sso-overview.md) -- Single Sign-On setup
- [Settings Overview](settings/overview.md) -- All system settings
