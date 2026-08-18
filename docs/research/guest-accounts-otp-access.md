# Guest Accounts & OTP Access Research

> Source ticket: ATT-889 — Research: OTP Codes for temporary Access to resources

## Goal

Let non-members access resources via Attractap terminals **without a full account /
login**. An admin creates a "guest account" (name + optional email, no password), which
exposes a TOTP secret + QR code. The guest adds it to an authenticator app (Google
Authenticator etc.) and signs in on a terminal by entering the current OTP code. Guests
can be granted access to specific resources but can never become maintainers, introducers,
or hold any other elevated permission, and can never use the web UI.

## Current state (what already exists)

- **Identity** — `User` entity carries `username` + `email` (both unique, `email` NOT NULL),
  plus passkeys, NFC cards, SSO `externalIdentifier`, credit balance, billing factor, roles,
  project memberships (`libs/database-entities/.../user.entity.ts`).
- **Multiple auth methods per user** — `AuthenticationDetail` supports `LOCAL_PASSWORD`,
  `SSO`, and `TOTP` (`authenticationDetail.entity.ts`, `authenticationType.enum.ts`).
- **TOTP is already implemented** — `TwoFactorService` (`apps/api/src/users-and-auth/auth/two-factor.service.ts`)
  uses `otplib` for `generateSecret`, `generateURI` (QR / otpauth), and `verify` (30s window),
  and stores secrets encrypted via `EncryptionService`. Today it is used **only as a 2FA
  add-on** on top of password/SSO, not as a primary credential.
- **RBAC** — `Role` / `Permission` / `RolePermission` / `UserRole`. A user with no roles has
  no effective permissions (least privilege by default). "Introducer" / "maintainer" are
  **not** RBAC roles; they are a separate `ResourceIntroducer` entity
  (`ResourceIntroducerType.INTRODUCER | MAINTAINER`) scoped to a resource or group.
- **Terminal (Attractap) auth** — the ESP32 firmware reads an NFC card UID and sends
  `REQUEST_CARD_AUTHENTICATION_DATA` over WebSocket; the API handler
  (`AttractapCardHandler.handleCardAuthenticationRequest`) resolves the card → user, computes
  access flags, and returns key material + `hasIntroduction` / `isIntroducer` /
  `canManageResource` / `supervisionMode` / `requiresSupervisor`.
- **Access control** — `ResourceUsageService.canControllResource` grants access when the user
  has `resources.update`, a valid (non-retraining-blocked) introduction, or is an
  introducer/maintainer, or holds a valid group introduction.

## Requirements distilled from the ticket

1. Admin-managed guest identities: name, optional email, **no password**.
2. Guests authenticate **only** on Attractap terminals (never the web UI).
3. TOTP (rotating code in an authenticator app) is the single credential; QR provisioning.
4. Guests can be granted access to specific resources.
5. Guests **cannot** be maintainers, introducers, or hold any other elevated permission.

## The core decision: extend `User` vs. a dedicated `Guest` concept

### Option A — Extend the existing `User` concept (discriminated type)

Add a `userType` discriminator (`member` | `guest`) to `User`, make `email` nullable, and add
a guest TOTP credential (primary auth, not 2FA). Guests are ordinary `User` rows with **zero
roles** (→ zero effective permissions) and a small set of explicit "never" guards.

**Pros**

- Reuses the entire access-control / usage / billing / forms / introductions stack unchanged:
  `ResourceIntroduction` (resource + group), `ResourceUsage`, `FormSubmission`,
  `BillingTransaction`, `canControllResource`, and the terminal card-auth handler all already
  key off `User`. Granting a guest access == granting an introduction to a guest-type user.
- Least-privilege is inherited for free: no roles → no `users.*`/`system.*`/`billing.*` powers.
- Small, contained schema change (one enum column + nullable email + one auth-detail type).

**Cons**

- Security is enforced by *guards* (must ensure guests can never be assigned roles, invited to
  projects, made introducer/maintainer, self-register, or authenticate to the web UI).
- The `User` table/entity grows slightly and carries guest-specific semantics.

### Option B — Dedicated separate `Guest` entity

A new `Guest` table with its own `GuestResourceAccess`, its own TOTP credential, and its own
terminal auth path.

**Pros**

- Cleanest security boundary: a `Guest` simply has no relationship to roles / projects /
  introducers / SSO / passkeys by construction.

**Cons**

- The access-control layer is heavily `User`-centric (`ResourceIntroduction.receiverUserId`,
  `ResourceUsage.user`, `FormSubmission.user`, `BillingTransaction.user`,
  `canControllResource(resourceId, user)`). A separate principal forces either a polymorphic
  "principal" refactor (TypeORM polymorphic associations are painful) or parallel
  guest-specific introductions/usage/billing (duplication + long-term divergence). This is a
  much larger, riskier change than Option A for little near-term security gain.

### Recommendation — **Option A: extend `User` with a discriminated guest type**

A fully separate entity is architecturally "cleaner" on paper, but the codebase's
access-control, usage, forms, and billing are all `User`-centric, so a separate `Guest` would
duplicate or polymorph-ify the entire surface — a disproportionate cost for a feature whose
main requirement (no escalation) is already satisfied by the existing least-privilege RBAC.
Extending `User` with a `userType` discriminator reuses introductions/usage/billing as-is and
requires only a handful of targeted, explicit "guests can never …" guards. If the guest
surface grows later, the discriminator can be split out then.

## Proposed design

- **Data model** — `User.userType` enum (`member` | `guest`, default `member`); migration makes
  `email` nullable. Reuse `AuthenticationDetail` with a dedicated guest credential (e.g.
  `AuthenticationType.GUEST_OTP`) so the existing 2FA gate never treats guest TOTP as a second
  factor. Secret stored encrypted via `EncryptionService`.
- **Provisioning** — admin creates a guest; API generates a secret + otpauth URI (reuse
  `otplib` `generateSecret`/`generateURI`) and returns a QR code + URI + secret for sharing.
  Re-provision (rotate) and revoke/disable supported.
- **Terminal login** — new WebSocket flow for touch-display readers: "Guest login" → on-screen
  OTP entry → `GUEST_CODE_AUTHENTICATE { resourceId, code }` → API verifies the TOTP (with
  replay protection), resolves access via the existing introduction path, and returns an access
  decision (mirrors card-auth flags, minus key material). Non-touch variants documented as out
  of scope.
- **Guards (guests can never …)** — hold roles; be granted `ResourceIntroducer`
  (introducer/maintainer); be invited to/join projects; self-register; authenticate to the web
  UI (session strategy rejects `userType === 'guest'`).
- **Replay protection** — track the last-used TOTP timestep per guest so a code cannot be
  replayed within its validity window (important because, unlike 2FA, TOTP is the *only*
  factor).

## Security notes

- Guest TOTP secret is the sole credential; store it encrypted (existing `EncryptionService`),
  never expose the plaintext secret after initial provisioning.
- Add replay protection (above) and rate-limit terminal code attempts (mirror existing login
  rate-limit guard).
- Keep guest identities outside the SSO/provisioning path so an IdP can never mint or escalate
  a guest.

## Identification & collision risk

Guest login is "anonymous code entry", which raises two distinct collision concerns.

1. **TOTP secret collision** — negligible. `otplib` `generateSecret()` yields ~160 bits of
   entropy; two guests getting the same secret is effectively impossible. Enforce uniqueness
   on a stored hash of the secret as a belt-and-braces check at provisioning.

2. **Code-space ambiguity** — the real concern. A 6-digit code is the *only* input, so the API
   must reverse-look-up the guest by evaluating the entered code against every active guest
   (O(G) per attempt). With G guests the probability that two guests coincidentally share the
   same code in a given 30s window is ~G² / 2·10⁶ — tiny for small G but non-zero and growing.
   The code also doubles as a bearer credential: anyone who observes a code can use it for that
   guest during its window (inherent to TOTP).

   **Recommendation:** give each guest a short, stable **access code** (4-digit numeric) that
   they enter together with their OTP code — `access code + OTP`. The access code is a direct,
   indexed key that resolves the guest in O(1) (no reverse-look-up, no list to scroll), and the
   OTP is then verified against exactly that guest's secret. This keeps the "no account, no
   password" promise while making the lookup deterministic and collision-free.

### Access code (guest handle)

- Dedicated column (e.g. `User.guestCode`), **not** the existing `username` (which is the web
  login identifier and must stay unique across members).
- **4-digit numeric** (`0000`–`9999`, 10⁴ = 10,000 values), enforced unique via a DB index with
  retry-on-collision. A numeric keypad is the fastest entry on the Attractap touchscreen.
- The 4-digit space is small: uniqueness is guaranteed by retry, but the practical guest count is
  a few hundred before collisions get frequent — fine for the intended use. The code is a
  non-secret identifier; the TOTP remains the secret factor.
- Prefer a random unique code over "hash of the user's ID": truncating a hash risks collisions
  and makes codes guessable/enumerable. A random code is just as easy to look up and reveals
  nothing. (If deterministic-from-ID is ever wanted, `id % 10000` is unique only below 10,000
  users and enumerable.)

   If a bare "code only" flow is still desired, at minimum:

   - scope the reverse-look-up to guests authorised for the tapped resource,
   - fail closed (reject with "try again / identify yourself") when a code matches more than
     one guest, and
   - keep replay protection + rate limiting.

## Implementation tickets

- Guest accounts — data model, TOTP credentials, admin API & admin UI (management, QR
  provisioning, resource access grants).
- Attractap — guest login via OTP code (firmware screen + WebSocket auth handler).
