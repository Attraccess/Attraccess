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

## Card keys and `AUTH_SESSION_SECRET`

Attractap card keys are created and checked by the server only; a reader never sees them. The server stores each key encrypted with a key derived from `AUTH_SESSION_SECRET`.

> [!WARNING]
> **Back up `AUTH_SESSION_SECRET` together with your database backups.** Without it the stored card keys cannot be read. Cards that were enrolled can then neither be used nor reset by Attraccess, and have to be erased with other tools.

Changing the secret makes the stored card keys unreadable until they are re-encrypted. To rotate the secret deliberately:

1. Stop the API and copy `storage/attraccess.sqlite`.
2. Run `OLD_AUTH_SESSION_SECRET=<old> NEW_AUTH_SESSION_SECRET=<new> pnpm nx run api:reencrypt-card-keys -- --dry-run`. It reads every stored card key and writes nothing.
3. Run the same command without `--dry-run`. All keys are converted in one transaction; if one cannot be read with the old secret nothing is changed.
4. Set `AUTH_SESSION_SECRET` to the new value and start the API.

> [!WARNING]
> The command converts card keys only. `AUTH_SESSION_SECRET` protects everything Attraccess stores encrypted: the license key, SSO provider secrets, two-factor secrets, MQTT and payment credentials. After you change it these values cannot be read any more. The API may then refuse to start because the license key is unreadable, and they have to be entered again. Only rotate the secret when you must, for example after it leaked.

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

### Reverse proxies and the real client IP

Per-IP throttling only works if Attraccess sees the **real client IP**. When it runs behind a reverse proxy (nginx, Traefik, Caddy, a CDN, or the bundled Docker stack), the connection arrives from the proxy, so without configuration every request looks like it comes from the proxy IP. One abusive client would then rate-limit everyone, and the audit log shows the proxy IP for all users.

Set the `TRUST_PROXY` environment variable to the number of trusted proxy hops between the client and Attraccess. The client IP is then taken from the `X-Forwarded-For` header added by your proxy:

| Deployment | `TRUST_PROXY` |
|------------|---------------|
| No reverse proxy (direct) | unset (default) |
| Single reverse proxy (nginx/Traefik/Caddy) | `1` |
| CDN in front of a reverse proxy | `2` |
| Specific trusted proxies only | comma-separated IPs/CIDRs, e.g. `10.0.0.0/8, 172.16.0.0/12`, or `uniquelocal` |

> [!WARNING]
> Trust only as many hops as actually exist in your deployment. If `TRUST_PROXY` trusts more hops than your real proxy chain, clients can forge `X-Forwarded-For` to rotate their apparent IP and evade rate limiting entirely. When unset, Attraccess trusts no forwarding headers (safe default). Changes take effect after a restart.

## Approved websites

Only approved websites may use a signed-in browser session. Other websites cannot read API responses, and their data-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) are refused with `403`. This also applies to websites under the same parent domain, for example `help.customer.com` next to `attraccess.customer.com`.

These addresses are approved automatically:

- the address Attraccess is served from (the scheme and `Host` of the request; behind a proxy see the warning below)
- the application URL and the public internet URL from **Settings** (a change applies immediately on the instance where it is saved, and within 60 seconds on other instances)
- `ATTRACCESS_URL`, `ATTRACCESS_FRONTEND_URL` and `ATTRACCESS_PUBLIC_INTERNET_URL`
- every entry in `ATTRACCESS_TRUSTED_ORIGINS`, an optional comma-separated list of exact origins (scheme, host and optional port; no wildcards, no paths), e.g. `ATTRACCESS_TRUSTED_ORIGINS=https://portal.example.com,https://kiosk.example.com`

The literal origin `null` is never approved. Refused requests are logged as a warning by `CrossSiteWriteGuard`, without cookie or token values:

```text
Refused POST /api/auth/session/local: origin_not_approved (origin=https://attraccess.example.com, served-as=http://attraccess.example.com, sec-fetch-site=same-origin). To approve a website, set ATTRACCESS_URL or add it to ATTRACCESS_TRUSTED_ORIGINS; behind a reverse proxy, set TRUST_PROXY.
```

The reason is `origin_not_approved`, `cross_site_request` (no `Origin`, but the browser marked the request as cross-site) or `cookie_without_origin` (a session cookie without an `Origin`). `served-as` is the address Attraccess thinks it was opened at. If it differs from `origin` only by `http`/`https`, see the reverse proxy warning below.

Not affected:

- requests with an `Authorization: Bearer <token>` header (session or API token). Other schemes, such as `Basic` added by a proxy, do not count.
- sign-in with plain `curl` and no browser headers
- the routes other systems call on purpose: SAML assertion and logout, OIDC back-channel logout, SSO provisioning and the SumUp callback. They authenticate the caller themselves.

> [!NOTE]
> Writes that carry only an `x-api-key` header are still checked. A website calling with an API key from the browser must be listed in `ATTRACCESS_TRUSTED_ORIGINS`, or use a bearer token instead.

> [!NOTE]
> **Scripts that use the browser cookie** must send an approved `Origin` header on writes. Prefer a bearer token (for example an API token) instead.

> [!WARNING]
> **Reverse proxies (check before upgrading):** if your proxy rewrites the host name, or terminates TLS (the browser uses `https`, Attraccess sees `http`), every write from the browser is refused with `403`, including sign-in and first-time setup. Fix it in the server configuration, since a locked-out administrator cannot reach Settings:
>
> - set `ATTRACCESS_URL` to the public address, e.g. `https://attraccess.example.com`, or
> - set `TRUST_PROXY` and make sure the proxy sends `X-Forwarded-Proto`, plus `X-Forwarded-Host` if it rewrites the host name (nginx does not send `X-Forwarded-Host` by default).
>
> Setting the application URL in Settings works too, if you can still sign in.

### Renewing a sign-in

`GET /api/auth/session/refresh` no longer exists, so opening a link cannot renew a session. Use `POST /api/auth/session/refresh`:

- Callers using the browser cookie get a new cookie and **no token** in the response.
- Callers sending a bearer token get a new token.

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
