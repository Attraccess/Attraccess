# Rate Limiting for Unauthenticated Endpoints — Design

Status: Approved
Date: 2026-04-27
Author: jappyjan + Claude

## Context

The Attraccess API exposes several unauthenticated POST endpoints that either trigger outbound email or accept credentials. Without rate limiting they enable several practical abuse vectors:

- Spamming arbitrary user inboxes by repeatedly hitting `POST /api/users/resend-verification-email` and `POST /api/users/reset-password`.
- Burning the SMTP quota of the deployment.
- Brute-forcing credentials via `POST /api/auth/session/local`.
- Probing tokens against `POST /api/users/verify-email`, `POST /api/users/accept-invitation`, and `POST /api/users/:userId/change-password-by-token`.

This design adds a single, runtime-configurable rate limit subsystem that protects every unauthenticated entrypoint with both per-IP and per-account guards. All thresholds are stored in the existing settings DB and editable from the admin Settings UI; no new environment variables are introduced.

## Goals and non-goals

Goals:

- Make targeted abuse of any unauthenticated endpoint expensive and noisy.
- Prevent a single attacker from locking out unrelated users behind shared NAT.
- Survive process restarts for account-level state (failed-login counts, last-send timestamps).
- Keep response shapes for enumeration-sensitive endpoints unchanged (silent rejection where appropriate).
- All thresholds adjustable by an admin without redeploy.

Non-goals (deferred):

- Distributed rate limiting across multiple API processes (single-instance today).
- IP allow/deny lists.
- CAPTCHA or proof-of-work fallback.
- Per-IP geographic or ASN-based rules.

## Architecture

Two complementary tiers, both governed by DB-backed settings:

1. **Per-IP sliding window** — in-process counters keyed by `(scope, ip)`. Operational guard against scripted abuse from a single source.
2. **Per-account state** — persistent columns on the `User` entity. Protects individual users behind shared NAT and across restarts.

Each protected route is annotated with a single `@RateLimit({ scope, mode })` decorator. A NestJS interceptor reads the decorator and applies the IP check uniformly — an interceptor (rather than a guard) is required because `mode: 'silentOk'` must short-circuit the request with a `200 { message: 'OK' }` body, which a `CanActivate` guard cannot do. For `mode: '429'` the interceptor throws an `HttpException(429)` with a `Retry-After` header. Per-account checks live inside the service code for the few endpoints that need them (login lockout, resend/reset cooldown), because those are intertwined with business logic.

```
            ┌──────────────────────────┐
            │  @RateLimit decorator    │
            └────────────┬─────────────┘
                         ▼
            ┌──────────────────────────┐
            │  RateLimitInterceptor    │
            │   - load settings        │
            │   - sliding window/IP    │
            │   - on exceed:           │
            │       mode=429   → throw │
            │       mode=silent → 200  │
            └────────────┬─────────────┘
                         ▼
            ┌──────────────────────────┐
            │  Controller → Service    │
            │   (per-account checks    │
            │    where applicable)     │
            └──────────────────────────┘
```

## Components

### New module: `apps/api/src/rate-limit/`

- `rate-limit.constants.ts` — declares `RATE_LIMIT_PARENT = 'rateLimit'` and `RATE_LIMIT_KEYS` mapping each tunable to a DB key. Also declares the in-code default values used as fallback.
- `rate-limit.service.ts` — the public API:
  - `checkIp(scope, ip): Promise<{ allowed, retryAfterSeconds }>` — sliding-window check, mutates the in-memory window on every call.
  - `accountCooldown(scope, lastSentAt): { allowed, retryAfterSeconds }` — pure helper for per-account cooldown decisions.
  - `recordLoginFailure(user)` / `clearLoginFailures(user)` — increment/reset failed-login counters and lock window on the User entity.
  - `isLoginLocked(user): { locked, retryAfterSeconds }`.
  - Reads settings via `SettingsStoreService` (cached 60 s by the existing cache layer).
  - Falls back to in-code defaults if a setting is missing or unparseable.
  - In-memory store: `Map<string, number[]>` keyed by `${scope}:${ip}`. Soft cap of 10 000 keys with LRU-style eviction to prevent memory-DoS.
- `rate-limit.interceptor.ts` — `NestInterceptor` implementation. Reads decorator metadata via `Reflector`, extracts the client IP from the request (using existing trust-proxy config), invokes `checkIp`, and either:
  - sets `Retry-After` on the response and throws `HttpException(429)` for `mode: '429'`, or
  - returns an `Observable.of({ message: 'OK' })` without invoking `next.handle()` for `mode: 'silentOk'` (matching the existing resend/reset response shape).
- `rate-limit.decorator.ts` — `@RateLimit({ scope, mode })` using `SetMetadata`.
- `rate-limit.module.ts` — exports the service and the interceptor; consumers apply the interceptor at the method level via `@UseInterceptors(RateLimitInterceptor)` or rely on a global registration in the application bootstrap.

Scopes:

- `login` — credential verification routes.
- `emailTrigger` — routes whose primary side effect is sending mail.
- `tokenAction` — routes that consume a token from a prior email.

Modes:

- `429` — return HTTP 429 with `Retry-After` header.
- `silentOk` — return HTTP 200 with `{ message: 'OK' }`. Used only where the success and rejection responses are already indistinguishable to a caller (resend, reset).

### Settings extension

- New DTOs in `apps/api/src/settings/dto/`:
  - `rate-limit-settings.dto.ts` — read shape.
  - `update-rate-limit-settings.dto.ts` — write shape with class-validator constraints (positive integers, sane upper bounds).
- `SystemSettingsDto` gains a `rateLimit` field.
- `UpdateSystemSettingsDto` gains an optional `rateLimit` field.
- `SettingsService` gets `getRateLimitSettings()` / `updateRateLimitSettings()` paralleling the existing app/SMTP settings methods.
- `SettingsController` does not need new routes — the existing `getSystemSettings` / `updateSystemSettings` carry the new field.

### User entity additions

In `libs/database-entities`:

- `lastVerificationEmailSentAt: Date | null`
- `lastPasswordResetSentAt: Date | null`
- `failedLoginCount: number` (default `0`)
- `loginLockedUntil: Date | null`

A new TypeORM migration adds these columns with appropriate defaults.

### Endpoint wiring

The following routes get a `@RateLimit` decorator (combined with `@UseInterceptors(RateLimitInterceptor)` or a global registration) and (where noted) per-account checks in the service layer.

| Route                                                  | Scope          | Mode      | Per-account check |
| ------------------------------------------------------ | -------------- | --------- | ----------------- |
| `POST /api/auth/session/local`                         | `login`        | `429`     | login lock + failure counter |
| `POST /api/users` (signup)                             | `emailTrigger` | `429`     | — |
| `POST /api/users/resend-verification-email`            | `emailTrigger` | `silentOk`| `lastVerificationEmailSentAt` cooldown |
| `POST /api/users/reset-password`                       | `emailTrigger` | `silentOk`| `lastPasswordResetSentAt` cooldown |
| `POST /api/users/verify-email`                         | `tokenAction`  | `429`     | — |
| `POST /api/users/:userId/change-password-by-token`     | `tokenAction`  | `429`     | — |
| `POST /api/users/accept-invitation`                    | `tokenAction`  | `429`     | — |

Per-account check semantics:

- **Login**: before validating credentials, the service checks `loginLockedUntil`. If locked, throw the same generic `Unauthorized` error used for invalid credentials — never reveal lock state to the caller. On bad password, increment `failedLoginCount`; if it crosses the configured threshold, set `loginLockedUntil = now + lockSeconds` and reset the counter to 0. On success, clear both fields.
- **Resend / reset**: after looking up the user, before sending mail, compare `now - lastSentAt < cooldownSeconds`. If still cooling, return `{ message: 'OK' }` without sending. Update the timestamp on every actual send.

### Frontend admin UI

In `apps/frontend/src/app/settings/`:

- `cards/RateLimitSettingsCard/` — read-only display of current values with an "Edit" affordance, mirroring `AppSettingsCard` and `SmtpSettingsCard`.
- `forms/RateLimitSettingsForm/` — controlled form with numeric inputs grouped by tier (per-IP, per-account), validation messages, and a save mutation against the existing `updateSystemSettings` endpoint.
- Register the card in `apps/frontend/src/app/settings/index.tsx` alongside the others.

## Default values

```
rateLimit:
  ipLogin:           { windowSeconds: 60,   maxRequests: 10 }
  ipEmailTrigger:    { windowSeconds: 900,  maxRequests: 5  }
  ipTokenAction:     { windowSeconds: 900,  maxRequests: 20 }
  accountVerifyResendCooldownSeconds:  60
  accountPasswordResetCooldownSeconds: 60
  accountLoginMaxFailures:             10
  accountLoginLockSeconds:             900
```

These match the values informally agreed during brainstorming. They are the in-code fallback used when a setting row is missing.

## Data flow examples

### Login attempt

```
Client → RateLimitInterceptor(scope:login, mode:429)
   interceptor: appendIpTimestamp; if window count > max → 429 + Retry-After
Client → AuthController.createSession → AuthService.login
   service: if user.loginLockedUntil > now → throw Unauthorized
   service: verify password
       bad  → user.failedLoginCount += 1
              if >= accountLoginMaxFailures:
                  user.loginLockedUntil = now + accountLoginLockSeconds
                  user.failedLoginCount = 0
              throw Unauthorized
       good → user.failedLoginCount = 0
              user.loginLockedUntil = null
              issue session
```

### Resend verification

```
Client → RateLimitInterceptor(scope:emailTrigger, mode:silentOk)
   interceptor: ip-window check; if exceeded → respond 200 { message: 'OK' } and stop
Client → UsersController.resendVerificationEmail
   service: lookup by email; if no user or already verified → return OK
   service: if now - user.lastVerificationEmailSentAt < cooldown → return OK
   service: generate token, send mail
   service: user.lastVerificationEmailSentAt = now; save
   service: return OK
```

## Error handling

- Settings load failure: log a warning and use in-code defaults. Never disable rate limiting because the DB hiccupped.
- IP extraction failure: treat as "unknown" and apply the limit conservatively (the `unknown` bucket is shared, so abuse from a misconfigured proxy gets noticed quickly without disrupting all users).
- Memory pressure: enforce a soft cap of 10 000 IP entries per scope; evict the oldest on overflow.
- Concurrent login failures: rely on TypeORM optimistic concurrency or short transaction; in the worst case a single extra failed attempt slips through, which is acceptable.

## Testing

Unit (`apps/api`):

- `rate-limit.service.spec.ts`
  - Sliding window: requests below threshold pass; requests above are blocked; entries fall out of the window after `windowSeconds`.
  - Account cooldown helper: returns correct `retryAfterSeconds`.
  - Login lock semantics: counter resets on success; lock applied on threshold; lock expires.
  - Settings fallback: missing/garbage settings → defaults used.
  - Memory cap: synthetic 10 001-key burst evicts oldest entry.
- `rate-limit.interceptor.spec.ts`
  - Decorator metadata is honored.
  - `mode: '429'` sets `Retry-After` and throws.
  - `mode: 'silentOk'` short-circuits with 200 `{ message: 'OK' }`.
- Endpoint specs (extend the existing ones rather than creating new files where possible):
  - `resend-verification-email.spec.ts` — second send within cooldown does not invoke the mail service.
  - `reset-password.spec.ts` (existing or new) — same cooldown behaviour.
  - `auth.controller.spec.ts` (or wherever login is tested) — N bad attempts produces a lock; success clears it.

Integration / manual:

- Manual e2e against the dev stack with mailpit (already set up):
  - Hammer resend with `curl` faster than cooldown — only the first within the window produces mail.
  - Run the same login with bad credentials enough times to lock; observe subsequent requests rejected even with the right password until the window passes.

## Migration and rollout

- TypeORM migration adds the four new `User` columns with default values, so existing rows are valid immediately.
- Settings are read lazily; no migration is needed for the settings table — missing rows simply fall back to defaults.
- No API contract changes for unaffected callers; the only new response code is `429` on routes that previously returned `200`/`401`/`403`.
- Frontend lands together with the backend so admins can edit the new values from day one.

## Open questions

None at design time. Memory-cap behaviour and silent-OK choice for resend/reset are deliberate.
