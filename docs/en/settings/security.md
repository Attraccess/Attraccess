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

## Auth Rate Limiting and Account Lockout

Failed authentication attempts on login, registration, and password reset endpoints are throttled per IP. Repeated login failures additionally lock the affected account. Settings are admin-tunable from **Settings -> Auth rate limiting**.

| Setting | Default | Description |
|---------|---------|-------------|
| `maxAttempts` | `5` | Failed attempts allowed inside the window before throttle / lockout kicks in. |
| `windowSeconds` | `900` | Sliding window for counting failures. |
| `lockoutDurationSeconds` | `900` | Base lockout duration. |
| `exponentialBackoff` | `false` | When `true`, lockouts grow by `backoffMultiplier` on each repeat. |
| `backoffMultiplier` | `2` | Multiplier applied to lockout duration on each repeat lockout. |

Rate limit triggers:

- **`429 Too Many Requests`** with a `Retry-After` header is returned when an IP exceeds the threshold.
- **`423 Locked`** with a `Retry-After` header is returned for a locked account on subsequent login attempts.

A successful login or admin unlock clears the lockout. Admin unlock is available via the user management UI.

## Auth Audit Log Format

Every auth attempt produces a single-line, space-separated log record under the `AuthAudit` logger context. Field names and order are stable so the log is fail2ban-friendly.

```
auth.failed type=login outcome=invalid_credentials ip=1.2.3.4 user_id=42 username=alice ts=2026-05-15T12:34:56.000Z reason=bad_password
auth.success type=login outcome=success ip=1.2.3.4 user_id=42 username=alice ts=2026-05-15T12:35:01.000Z
```

| Field | Description |
|-------|-------------|
| `prefix` | `auth.success` for successes, `auth.failed` otherwise. |
| `type` | One of `login`, `register`, `password_reset_request`, `password_reset_complete`. |
| `outcome` | `success`, `invalid_credentials`, `account_locked`, `rate_limited`, `two_factor_required`, `two_factor_invalid`, `email_not_verified`, `invalid_token`, `invalid_input`, `unknown_user`. |
| `ip` | Client IP. Falls back to `unknown` when not resolvable. |
| `user_id` | Numeric user id when known, `-` otherwise. |
| `username` | Username when known, `-` otherwise. Whitespace and quotes are replaced with `_`. |
| `ts` | ISO 8601 UTC timestamp. |
| `reason` | Optional short reason tag. Omitted when not set. |

> Passwords, tokens, and other secrets are never logged.

### Fail2ban regex

A minimal `failregex` for `/etc/fail2ban/filter.d/attraccess-auth.conf`:

```
failregex = ^.*auth\.failed type=(?:login|register|password_reset_request|password_reset_complete) outcome=\S+ ip=<HOST> .*$
ignoreregex =
```

Pair with a jail (e.g., `/etc/fail2ban/jail.d/attraccess.local`) that watches the API logs:

```ini
[attraccess-auth]
enabled  = true
filter   = attraccess-auth
logpath  = /var/log/attraccess/api.log
maxretry = 5
findtime = 900
bantime  = 900
```

The shipped Docker Compose stack already wires both files for you behind the `fail2ban` profile — see [Docker Compose installation](installation/docker-compose.md#brute-force-ip-banning-with-fail2ban).

## fail2ban Administration

Once the `fail2ban` Compose profile is running, these commands manage the jail.

### List active bans

```bash
docker compose exec fail2ban fail2ban-client status attraccess-auth
```

Output includes `Currently banned`, `Total banned`, and the `Banned IP list`.

### Unban an IP

```bash
docker compose exec fail2ban fail2ban-client set attraccess-auth unbanip 1.2.3.4
```

### Manually ban an IP

```bash
docker compose exec fail2ban fail2ban-client set attraccess-auth banip 1.2.3.4
```

### Re-tune thresholds

The defaults are read from `F2B_ATTRACCESS_MAXRETRY`, `F2B_ATTRACCESS_FINDTIME`, and `F2B_ATTRACCESS_BANTIME` at container start. Edit `.env.docker-compose` (or your `.env`) and recreate the service:

```bash
docker compose up -d --force-recreate fail2ban
```

For ephemeral tuning without a restart:

```bash
docker compose exec fail2ban fail2ban-client set attraccess-auth maxretry 10
docker compose exec fail2ban fail2ban-client set attraccess-auth findtime 600
docker compose exec fail2ban fail2ban-client set attraccess-auth bantime 3600
```

These live changes are lost on next restart — persist them via env vars for production.

### Inspect the audit log fail2ban is reading

```bash
docker compose logs attraccess | grep -E 'auth\.failed'
```

## See Also

- [Environment Variables](installation/environment-variables.md) -- All configuration options
- [SSL Setup](installation/ssl-setup.md) -- Configure HTTPS
- [SSO Overview](user-management/sso-overview.md) -- Single Sign-On setup
- [Settings Overview](settings/overview.md) -- All system settings
