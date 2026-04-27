# Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-IP and per-account rate limiting to every unauthenticated POST endpoint in the Attraccess API, with all thresholds configurable from the admin Settings UI.

**Architecture:** A new `RateLimitModule` exposes a `RateLimitService` (sliding window store + per-account helpers) and a `RateLimitInterceptor` that reads a `@RateLimit({ scope, mode })` decorator. Settings live in the existing DB-backed `setting` table under a new `rateLimit` parent and surface through the existing `getSystemSettings`/`updateSystemSettings` HTTP routes. Account-level state (failed-login counter, login lock, last-send timestamps) is stored on the `User` entity.

**Tech Stack:** NestJS 11, TypeORM (SQLite), Jest, Vite/React + heroUI on the frontend, `@attraccess/react-query-client` for generated frontend hooks.

**Working directory:** `/Users/jappy/code/attraccess/Attraccess-att-266` (worktree of branch `att-266-loosing-the-account-activation-email-is-unrecoverable`).

---

## File Structure

**New files (backend):**
- `apps/api/src/rate-limit/rate-limit.constants.ts`
- `apps/api/src/rate-limit/rate-limit.types.ts`
- `apps/api/src/rate-limit/rate-limit.decorator.ts`
- `apps/api/src/rate-limit/rate-limit.service.ts`
- `apps/api/src/rate-limit/rate-limit.service.spec.ts`
- `apps/api/src/rate-limit/rate-limit.interceptor.ts`
- `apps/api/src/rate-limit/rate-limit.interceptor.spec.ts`
- `apps/api/src/rate-limit/rate-limit.module.ts`

**New files (settings):**
- `apps/api/src/settings/dto/rate-limit-settings.dto.ts`
- `apps/api/src/settings/dto/update-rate-limit-settings.dto.ts`

**New files (DB):**
- `apps/api/src/database/migrations/1774981000000-add-rate-limit-fields-to-user.ts`

**New files (frontend):**
- `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/index.tsx`
- `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/en.json`
- `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/de.json`
- `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/index.tsx`
- `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/en.json`
- `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/de.json`

**Modified files:**
- `libs/database-entities/src/lib/entities/user.entity.ts` — four new columns
- `apps/api/src/settings/dto/system-settings.dto.ts` — add `rateLimit` field
- `apps/api/src/settings/dto/update-system-settings.dto.ts` — add optional `rateLimit` field
- `apps/api/src/settings/settings.service.ts` — read/write rate-limit settings
- `apps/api/src/app/app.module.ts` — register `RateLimitModule`
- `apps/api/src/users-and-auth/users/users.controller.ts` — apply decorator to 6 routes
- `apps/api/src/users-and-auth/users/users.service.ts` — resend cooldown
- `apps/api/src/users-and-auth/users/resend-verification-email.spec.ts` — extend
- `apps/api/src/users-and-auth/auth/auth.controller.ts` — apply decorator to login route
- `apps/api/src/users-and-auth/auth/auth.service.ts` — login lockout logic
- `apps/api/src/users-and-auth/auth/auth.service.spec.ts` — extend (or create lockout spec)
- `apps/frontend/src/app/settings/index.tsx` — register new card
- Generated: `libs/api-client/src/generated/Api.ts`, `libs/react-query-client/src/lib/requests/{services,schemas,types}.gen.ts`, `libs/react-query-client/src/lib/queries/{queries,common}.ts`

---

## Task 1: Scaffold rate-limit module

**Files:**
- Create: `apps/api/src/rate-limit/rate-limit.constants.ts`
- Create: `apps/api/src/rate-limit/rate-limit.types.ts`
- Create: `apps/api/src/rate-limit/rate-limit.decorator.ts`

- [ ] **Step 1: Create the constants file**

Create `apps/api/src/rate-limit/rate-limit.constants.ts`:

```ts
// Holds default rate-limit thresholds and DB setting keys for unauth routes
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

export const RATE_LIMIT_PARENT = 'rateLimit';

export const RATE_LIMIT_KEYS = {
  ipLoginWindowSeconds: 'ip_login_window_seconds',
  ipLoginMaxRequests: 'ip_login_max_requests',
  ipEmailTriggerWindowSeconds: 'ip_email_trigger_window_seconds',
  ipEmailTriggerMaxRequests: 'ip_email_trigger_max_requests',
  ipTokenActionWindowSeconds: 'ip_token_action_window_seconds',
  ipTokenActionMaxRequests: 'ip_token_action_max_requests',
  accountVerifyResendCooldownSeconds: 'account_verify_resend_cooldown_seconds',
  accountPasswordResetCooldownSeconds: 'account_password_reset_cooldown_seconds',
  accountLoginMaxFailures: 'account_login_max_failures',
  accountLoginLockSeconds: 'account_login_lock_seconds',
} as const;

export const RATE_LIMIT_DEFAULTS = {
  ipLoginWindowSeconds: 60,
  ipLoginMaxRequests: 10,
  ipEmailTriggerWindowSeconds: 900,
  ipEmailTriggerMaxRequests: 5,
  ipTokenActionWindowSeconds: 900,
  ipTokenActionMaxRequests: 20,
  accountVerifyResendCooldownSeconds: 60,
  accountPasswordResetCooldownSeconds: 60,
  accountLoginMaxFailures: 10,
  accountLoginLockSeconds: 900,
} as const;

export const RATE_LIMIT_METADATA_KEY = 'attraccess.rateLimit';

export const RATE_LIMIT_IP_BUCKET_CAP = 10_000;

export const RATE_LIMIT_SILENT_OK_BODY = { message: 'OK' } as const;
```

- [ ] **Step 2: Create the types file**

Create `apps/api/src/rate-limit/rate-limit.types.ts`:

```ts
// Public rate-limit scopes, modes, decorator metadata shape, and helper return types
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

export type RateLimitScope = 'login' | 'emailTrigger' | 'tokenAction';

export type RateLimitMode = '429' | 'silentOk';

export interface RateLimitMetadata {
  scope: RateLimitScope;
  mode: RateLimitMode;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}
```

- [ ] **Step 3: Create the decorator**

Create `apps/api/src/rate-limit/rate-limit.decorator.ts`:

```ts
// Method decorator that tags a route with its rate-limit scope and rejection mode
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_METADATA_KEY } from './rate-limit.constants';
import type { RateLimitMetadata } from './rate-limit.types';

export const RateLimit = (metadata: RateLimitMetadata) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, metadata);
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/rate-limit/rate-limit.constants.ts apps/api/src/rate-limit/rate-limit.types.ts apps/api/src/rate-limit/rate-limit.decorator.ts
git commit -m "feat(api): add rate-limit constants, types, and decorator"
```

---

## Task 2: TDD `RateLimitService.checkIp` (sliding window + memory cap)

**Files:**
- Create: `apps/api/src/rate-limit/rate-limit.service.spec.ts`
- Create: `apps/api/src/rate-limit/rate-limit.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/rate-limit/rate-limit.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { RateLimitService } from './rate-limit.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { RATE_LIMIT_DEFAULTS, RATE_LIMIT_IP_BUCKET_CAP } from './rate-limit.constants';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let settingsStore: jest.Mocked<Pick<SettingsStoreService, 'getPlainSetting'>>;

  beforeEach(async () => {
    settingsStore = { getPlainSetting: jest.fn().mockResolvedValue(null) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: SettingsStoreService, useValue: settingsStore },
      ],
    }).compile();
    service = moduleRef.get(RateLimitService);
  });

  describe('checkIp', () => {
    it('allows requests under the threshold', async () => {
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        const decision = await service.checkIp('login', '203.0.113.1');
        expect(decision.allowed).toBe(true);
      }
    });

    it('blocks the next request after the threshold and reports retry-after', async () => {
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        await service.checkIp('login', '203.0.113.2');
      }
      const decision = await service.checkIp('login', '203.0.113.2');
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
      expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
        RATE_LIMIT_DEFAULTS.ipLoginWindowSeconds,
      );
    });

    it('lets requests through again once the window has expired', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        await service.checkIp('login', '203.0.113.3');
      }
      jest.setSystemTime(
        new Date(
          Date.now() + (RATE_LIMIT_DEFAULTS.ipLoginWindowSeconds + 1) * 1000,
        ),
      );
      const decision = await service.checkIp('login', '203.0.113.3');
      expect(decision.allowed).toBe(true);
      jest.useRealTimers();
    });

    it('keeps separate buckets per scope and per ip', async () => {
      for (let i = 0; i < RATE_LIMIT_DEFAULTS.ipLoginMaxRequests; i++) {
        await service.checkIp('login', '203.0.113.4');
      }
      const otherIp = await service.checkIp('login', '203.0.113.5');
      const otherScope = await service.checkIp('emailTrigger', '203.0.113.4');
      expect(otherIp.allowed).toBe(true);
      expect(otherScope.allowed).toBe(true);
    });

    it('caps memory at RATE_LIMIT_IP_BUCKET_CAP per scope and evicts oldest', async () => {
      for (let i = 0; i < RATE_LIMIT_IP_BUCKET_CAP + 50; i++) {
        await service.checkIp('login', `10.0.0.${i}`);
      }
      // The very first IP should have been evicted, so a fresh request from
      // it must still be allowed (its history was thrown away).
      const decision = await service.checkIp('login', '10.0.0.0');
      expect(decision.allowed).toBe(true);
    });

    it('falls back to defaults when the stored setting is unparseable', async () => {
      settingsStore.getPlainSetting.mockResolvedValue('not a number');
      const decision = await service.checkIp('login', '203.0.113.6');
      expect(decision.allowed).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.service.spec.ts
```

Expected: failures because `RateLimitService` does not exist yet.

- [ ] **Step 3: Implement the minimal `RateLimitService` to make the tests pass**

Create `apps/api/src/rate-limit/rate-limit.service.ts`:

```ts
// Sliding-window per-IP rate limiter and per-account cooldown helpers
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { Injectable, Logger } from '@nestjs/common';
import { SettingsStoreService } from '../settings/settings-store.service';
import {
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_IP_BUCKET_CAP,
  RATE_LIMIT_KEYS,
  RATE_LIMIT_PARENT,
} from './rate-limit.constants';
import type { RateLimitDecision, RateLimitScope } from './rate-limit.types';

interface ScopeConfig {
  windowSeconds: number;
  maxRequests: number;
}

type IpBucket = Map<string, number[]>;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly buckets = new Map<RateLimitScope, IpBucket>([
    ['login', new Map()],
    ['emailTrigger', new Map()],
    ['tokenAction', new Map()],
  ]);

  constructor(private readonly settingsStore: SettingsStoreService) {}

  async checkIp(scope: RateLimitScope, ip: string): Promise<RateLimitDecision> {
    const config = await this.getScopeConfig(scope);
    const bucket = this.buckets.get(scope) ?? new Map();
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;

    const existing = bucket.get(ip) ?? [];
    const fresh = existing.filter((t) => t > windowStart);

    if (fresh.length >= config.maxRequests) {
      const oldest = fresh[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + config.windowSeconds * 1000 - now) / 1000),
      );
      bucket.set(ip, fresh);
      this.enforceCap(bucket);
      return { allowed: false, retryAfterSeconds };
    }

    fresh.push(now);
    bucket.set(ip, fresh);
    this.enforceCap(bucket);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private enforceCap(bucket: IpBucket): void {
    if (bucket.size <= RATE_LIMIT_IP_BUCKET_CAP) return;
    const overflow = bucket.size - RATE_LIMIT_IP_BUCKET_CAP;
    let removed = 0;
    for (const key of bucket.keys()) {
      if (removed >= overflow) break;
      bucket.delete(key);
      removed += 1;
    }
  }

  private async getScopeConfig(scope: RateLimitScope): Promise<ScopeConfig> {
    switch (scope) {
      case 'login':
        return {
          windowSeconds: await this.readNumber(
            RATE_LIMIT_KEYS.ipLoginWindowSeconds,
            RATE_LIMIT_DEFAULTS.ipLoginWindowSeconds,
          ),
          maxRequests: await this.readNumber(
            RATE_LIMIT_KEYS.ipLoginMaxRequests,
            RATE_LIMIT_DEFAULTS.ipLoginMaxRequests,
          ),
        };
      case 'emailTrigger':
        return {
          windowSeconds: await this.readNumber(
            RATE_LIMIT_KEYS.ipEmailTriggerWindowSeconds,
            RATE_LIMIT_DEFAULTS.ipEmailTriggerWindowSeconds,
          ),
          maxRequests: await this.readNumber(
            RATE_LIMIT_KEYS.ipEmailTriggerMaxRequests,
            RATE_LIMIT_DEFAULTS.ipEmailTriggerMaxRequests,
          ),
        };
      case 'tokenAction':
        return {
          windowSeconds: await this.readNumber(
            RATE_LIMIT_KEYS.ipTokenActionWindowSeconds,
            RATE_LIMIT_DEFAULTS.ipTokenActionWindowSeconds,
          ),
          maxRequests: await this.readNumber(
            RATE_LIMIT_KEYS.ipTokenActionMaxRequests,
            RATE_LIMIT_DEFAULTS.ipTokenActionMaxRequests,
          ),
        };
    }
  }

  private async readNumber(key: string, fallback: number): Promise<number> {
    try {
      const raw = await this.settingsStore.getPlainSetting(
        RATE_LIMIT_PARENT,
        key,
      );
      if (raw === null) return fallback;
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Failed to read rate-limit setting ${key}, using default ${fallback}`,
        error as Error,
      );
      return fallback;
    }
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.service.spec.ts
```

Expected: all `checkIp` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rate-limit/rate-limit.service.ts apps/api/src/rate-limit/rate-limit.service.spec.ts
git commit -m "feat(api): add RateLimitService.checkIp sliding window"
```

---

## Task 3: TDD `RateLimitService.accountCooldown`

**Files:**
- Modify: `apps/api/src/rate-limit/rate-limit.service.spec.ts`
- Modify: `apps/api/src/rate-limit/rate-limit.service.ts`

- [ ] **Step 1: Add the failing test inside the existing `describe('RateLimitService', ...)` block**

Append to `apps/api/src/rate-limit/rate-limit.service.spec.ts`:

```ts
  describe('accountCooldown', () => {
    it('allows when there is no previous send', async () => {
      const decision = await service.accountCooldown('verifyResend', null);
      expect(decision.allowed).toBe(true);
      expect(decision.retryAfterSeconds).toBe(0);
    });

    it('blocks when the previous send was inside the cooldown window', async () => {
      const decision = await service.accountCooldown(
        'verifyResend',
        new Date(Date.now() - 5 * 1000),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('allows again once the cooldown has passed', async () => {
      const decision = await service.accountCooldown(
        'verifyResend',
        new Date(
          Date.now() -
            (RATE_LIMIT_DEFAULTS.accountVerifyResendCooldownSeconds + 1) * 1000,
        ),
      );
      expect(decision.allowed).toBe(true);
    });

    it('uses the password-reset cooldown for the passwordReset key', async () => {
      const decision = await service.accountCooldown(
        'passwordReset',
        new Date(Date.now() - 5 * 1000),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
        RATE_LIMIT_DEFAULTS.accountPasswordResetCooldownSeconds,
      );
    });
  });
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.service.spec.ts
```

Expected: `service.accountCooldown is not a function`.

- [ ] **Step 3: Implement `accountCooldown`**

Add to `apps/api/src/rate-limit/rate-limit.service.ts`:

```ts
  async accountCooldown(
    kind: 'verifyResend' | 'passwordReset',
    lastSentAt: Date | null,
  ): Promise<RateLimitDecision> {
    const cooldownSeconds = await this.readNumber(
      kind === 'verifyResend'
        ? RATE_LIMIT_KEYS.accountVerifyResendCooldownSeconds
        : RATE_LIMIT_KEYS.accountPasswordResetCooldownSeconds,
      kind === 'verifyResend'
        ? RATE_LIMIT_DEFAULTS.accountVerifyResendCooldownSeconds
        : RATE_LIMIT_DEFAULTS.accountPasswordResetCooldownSeconds,
    );
    if (!lastSentAt) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const elapsedSeconds = (Date.now() - lastSentAt.getTime()) / 1000;
    if (elapsedSeconds >= cooldownSeconds) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(cooldownSeconds - elapsedSeconds)),
    };
  }
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.service.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rate-limit/rate-limit.service.ts apps/api/src/rate-limit/rate-limit.service.spec.ts
git commit -m "feat(api): add RateLimitService.accountCooldown helper"
```

---

## Task 4: TDD login lock helpers

**Files:**
- Modify: `apps/api/src/rate-limit/rate-limit.service.spec.ts`
- Modify: `apps/api/src/rate-limit/rate-limit.service.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/api/src/rate-limit/rate-limit.service.spec.ts`:

```ts
  describe('login lock', () => {
    const baseUser = (overrides: Partial<{ failedLoginCount: number; loginLockedUntil: Date | null }> = {}) => ({
      failedLoginCount: 0,
      loginLockedUntil: null,
      ...overrides,
    });

    it('reports unlocked when no lock is set', async () => {
      const decision = await service.checkLoginLock(baseUser());
      expect(decision.allowed).toBe(true);
    });

    it('reports unlocked once the lock expiry has passed', async () => {
      const decision = await service.checkLoginLock(
        baseUser({ loginLockedUntil: new Date(Date.now() - 1000) }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('reports locked when loginLockedUntil is in the future', async () => {
      const decision = await service.checkLoginLock(
        baseUser({ loginLockedUntil: new Date(Date.now() + 60_000) }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('increments the counter and triggers a lock at the threshold', async () => {
      const user = baseUser({
        failedLoginCount: RATE_LIMIT_DEFAULTS.accountLoginMaxFailures - 1,
      });
      const result = await service.applyLoginFailure(user);
      expect(result.failedLoginCount).toBe(0);
      expect(result.loginLockedUntil).not.toBeNull();
      expect(
        (result.loginLockedUntil as Date).getTime() - Date.now(),
      ).toBeGreaterThan(0);
    });

    it('increments without locking when below threshold', async () => {
      const result = await service.applyLoginFailure(baseUser());
      expect(result.failedLoginCount).toBe(1);
      expect(result.loginLockedUntil).toBeNull();
    });

    it('clears counter and lock on success', () => {
      const result = service.applyLoginSuccess(
        baseUser({
          failedLoginCount: 5,
          loginLockedUntil: new Date(Date.now() + 1000),
        }),
      );
      expect(result.failedLoginCount).toBe(0);
      expect(result.loginLockedUntil).toBeNull();
    });
  });
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.service.spec.ts
```

Expected: `service.checkLoginLock is not a function`, etc.

- [ ] **Step 3: Implement helpers**

Add to `apps/api/src/rate-limit/rate-limit.service.ts`:

```ts
  async checkLoginLock(
    user: { loginLockedUntil: Date | null },
  ): Promise<RateLimitDecision> {
    if (!user.loginLockedUntil) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    const remainingMs = user.loginLockedUntil.getTime() - Date.now();
    if (remainingMs <= 0) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  async applyLoginFailure(user: {
    failedLoginCount: number;
    loginLockedUntil: Date | null;
  }): Promise<{ failedLoginCount: number; loginLockedUntil: Date | null }> {
    const maxFailures = await this.readNumber(
      RATE_LIMIT_KEYS.accountLoginMaxFailures,
      RATE_LIMIT_DEFAULTS.accountLoginMaxFailures,
    );
    const lockSeconds = await this.readNumber(
      RATE_LIMIT_KEYS.accountLoginLockSeconds,
      RATE_LIMIT_DEFAULTS.accountLoginLockSeconds,
    );
    const next = (user.failedLoginCount ?? 0) + 1;
    if (next >= maxFailures) {
      return {
        failedLoginCount: 0,
        loginLockedUntil: new Date(Date.now() + lockSeconds * 1000),
      };
    }
    return {
      failedLoginCount: next,
      loginLockedUntil: user.loginLockedUntil,
    };
  }

  applyLoginSuccess(_user: {
    failedLoginCount: number;
    loginLockedUntil: Date | null;
  }): { failedLoginCount: number; loginLockedUntil: Date | null } {
    return { failedLoginCount: 0, loginLockedUntil: null };
  }
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rate-limit/rate-limit.service.ts apps/api/src/rate-limit/rate-limit.service.spec.ts
git commit -m "feat(api): add login-lock helpers to RateLimitService"
```

---

## Task 5: TDD `RateLimitInterceptor`

**Files:**
- Create: `apps/api/src/rate-limit/rate-limit.interceptor.spec.ts`
- Create: `apps/api/src/rate-limit/rate-limit.interceptor.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/rate-limit/rate-limit.interceptor.spec.ts`:

```ts
import { ExecutionContext, HttpException, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, lastValueFrom } from 'rxjs';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitService } from './rate-limit.service';
import {
  RATE_LIMIT_METADATA_KEY,
  RATE_LIMIT_SILENT_OK_BODY,
} from './rate-limit.constants';
import type { RateLimitMetadata } from './rate-limit.types';

describe('RateLimitInterceptor', () => {
  const setupContext = (metadata: RateLimitMetadata | null, ip = '198.51.100.1') => {
    const reflector = {
      get: jest.fn().mockImplementation((key: string) => (key === RATE_LIMIT_METADATA_KEY ? metadata : null)),
    } as unknown as Reflector;
    const setHeader = jest.fn();
    const ctx = {
      getHandler: () => () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip, ips: [ip], headers: {} }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    return { reflector, ctx, setHeader };
  };

  it('passes through when no metadata is set', async () => {
    const { reflector, ctx } = setupContext(null);
    const rateLimit = { checkIp: jest.fn() } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const next: CallHandler = { handle: () => of('payload') };
    await expect(lastValueFrom(await interceptor.intercept(ctx, next))).resolves.toBe('payload');
    expect(rateLimit.checkIp).not.toHaveBeenCalled();
  });

  it('throws 429 with Retry-After when over the limit in 429 mode', async () => {
    const { reflector, ctx, setHeader } = setupContext({ scope: 'login', mode: '429' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 42 }),
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const next: CallHandler = { handle: () => of('payload') };
    let caught: HttpException | null = null;
    try {
      await firstValueFrom(await interceptor.intercept(ctx, next));
    } catch (err) {
      caught = err as HttpException;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('returns silent OK when over the limit in silentOk mode', async () => {
    const { reflector, ctx } = setupContext({ scope: 'emailTrigger', mode: 'silentOk' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 5 }),
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const handle = jest.fn().mockReturnValue(of('payload'));
    const next: CallHandler = { handle };
    const result = await firstValueFrom(await interceptor.intercept(ctx, next));
    expect(result).toEqual(RATE_LIMIT_SILENT_OK_BODY);
    expect(handle).not.toHaveBeenCalled();
  });

  it('lets the request through when allowed', async () => {
    const { reflector, ctx } = setupContext({ scope: 'login', mode: '429' });
    const rateLimit = {
      checkIp: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    } as unknown as RateLimitService;
    const interceptor = new RateLimitInterceptor(reflector, rateLimit);
    const next: CallHandler = { handle: () => of('payload') };
    await expect(lastValueFrom(await interceptor.intercept(ctx, next))).resolves.toBe('payload');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.interceptor.spec.ts
```

Expected: cannot find module `RateLimitInterceptor`.

- [ ] **Step 3: Implement the interceptor**

Create `apps/api/src/rate-limit/rate-limit.interceptor.ts`:

```ts
// NestJS interceptor that enforces per-IP rate limits annotated with @RateLimit
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import {
  RATE_LIMIT_METADATA_KEY,
  RATE_LIMIT_SILENT_OK_BODY,
} from './rate-limit.constants';
import { RateLimitService } from './rate-limit.service';
import type { RateLimitMetadata } from './rate-limit.types';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const metadata = this.reflector.get<RateLimitMetadata | null>(
      RATE_LIMIT_METADATA_KEY,
      context.getHandler(),
    );
    if (!metadata) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{ ip?: string; ips?: string[]; headers?: Record<string, string | string[] | undefined> }>();
    const ip = this.resolveIp(request);
    const decision = await this.rateLimit.checkIp(metadata.scope, ip);
    if (decision.allowed) {
      return next.handle();
    }

    if (metadata.mode === 'silentOk') {
      return of(RATE_LIMIT_SILENT_OK_BODY);
    }

    const response = http.getResponse<{ setHeader: (name: string, value: number | string) => void }>();
    response.setHeader('Retry-After', decision.retryAfterSeconds);
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  private resolveIp(request: {
    ip?: string;
    ips?: string[];
    headers?: Record<string, string | string[] | undefined>;
  }): string {
    if (Array.isArray(request.ips) && request.ips.length > 0) {
      return request.ips[0];
    }
    if (request.ip) return request.ip;
    return 'unknown';
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm nx test api --no-cache --testFile=rate-limit.interceptor.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/rate-limit/rate-limit.interceptor.ts apps/api/src/rate-limit/rate-limit.interceptor.spec.ts
git commit -m "feat(api): add RateLimitInterceptor with 429 + silentOk modes"
```

---

## Task 6: Add User entity columns

**Files:**
- Modify: `libs/database-entities/src/lib/entities/user.entity.ts`

- [ ] **Step 1: Add the four new columns at the end of the `User` class**

Open `libs/database-entities/src/lib/entities/user.entity.ts` and add the following columns after the existing `nfcKeySeedToken` column (around line 189), before the `sessions` `@OneToMany`:

```ts
  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  lastVerificationEmailSentAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  lastPasswordResetSentAt!: Date | null;

  @Column({ type: 'integer', default: 0 })
  @Exclude()
  failedLoginCount!: number;

  @Column({ type: 'datetime', nullable: true })
  @Exclude()
  loginLockedUntil!: Date | null;
```

- [ ] **Step 2: Build the entities lib to confirm types compile**

```bash
pnpm nx build database-entities
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add libs/database-entities/src/lib/entities/user.entity.ts
git commit -m "feat(db): add rate-limit fields to User entity"
```

---

## Task 7: Migration for the new User columns

**Files:**
- Create: `apps/api/src/database/migrations/1774981000000-add-rate-limit-fields-to-user.ts`

- [ ] **Step 1: Create the migration**

Create `apps/api/src/database/migrations/1774981000000-add-rate-limit-fields-to-user.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRateLimitFieldsToUser1774981000000 implements MigrationInterface {
  name = 'AddRateLimitFieldsToUser1774981000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "lastVerificationEmailSentAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "lastPasswordResetSentAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "failedLoginCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN "loginLockedUntil" datetime`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "loginLockedUntil"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "failedLoginCount"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastPasswordResetSentAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "lastVerificationEmailSentAt"`);
  }
}
```

- [ ] **Step 2: Register the migration**

Open `apps/api/src/database/migrations/index.ts`. Add an import + export for the new migration alongside the existing entries, in chronological order. The file already follows a pattern such as:

```ts
export { AddCookieSameSiteSetting1772617000000 } from './1772617000000-add-cookie-same-site-setting';
```

Add a similar line for `AddRateLimitFieldsToUser1774981000000`.

- [ ] **Step 3: Run migrations against the dev DB**

The API runs migrations on start. Smoke-test by booting it once:

```bash
pnpm nx serve api &
APIPID=$!
sleep 10
kill $APIPID
```

Expected: log line `Migration AddRateLimitFieldsToUser1774981000000 has been executed successfully` and the API stays up.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/database/migrations/1774981000000-add-rate-limit-fields-to-user.ts apps/api/src/database/migrations/index.ts
git commit -m "feat(api): migration to add User rate-limit columns"
```

---

## Task 8: Wire `RateLimitModule`

**Files:**
- Create: `apps/api/src/rate-limit/rate-limit.module.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Create the module**

Create `apps/api/src/rate-limit/rate-limit.module.ts`:

```ts
// Module bundling the rate-limit service, interceptor, and DI wiring
// FEATURE: Rate limiting subsystem for unauthenticated API endpoints

import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { RateLimitService } from './rate-limit.service';
import { RateLimitInterceptor } from './rate-limit.interceptor';

@Module({
  imports: [SettingsModule],
  providers: [RateLimitService, RateLimitInterceptor],
  exports: [RateLimitService, RateLimitInterceptor],
})
export class RateLimitModule {}
```

- [ ] **Step 2: Register the module in `AppModule`**

Open `apps/api/src/app/app.module.ts`, add `import { RateLimitModule } from '../rate-limit/rate-limit.module';` near the other module imports, and add `RateLimitModule` to the `imports` array of the `@Module` decorator.

- [ ] **Step 3: Build the API to confirm wiring**

```bash
pnpm nx build api
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/rate-limit/rate-limit.module.ts apps/api/src/app/app.module.ts
git commit -m "feat(api): register RateLimitModule"
```

---

## Task 9: Add settings DTOs

**Files:**
- Create: `apps/api/src/settings/dto/rate-limit-settings.dto.ts`
- Create: `apps/api/src/settings/dto/update-rate-limit-settings.dto.ts`
- Modify: `apps/api/src/settings/dto/system-settings.dto.ts`
- Modify: `apps/api/src/settings/dto/update-system-settings.dto.ts`

- [ ] **Step 1: Create the read DTO**

Create `apps/api/src/settings/dto/rate-limit-settings.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';

export class RateLimitSettingsDto {
  @ApiProperty({ example: 60 })
  ipLoginWindowSeconds!: number;

  @ApiProperty({ example: 10 })
  ipLoginMaxRequests!: number;

  @ApiProperty({ example: 900 })
  ipEmailTriggerWindowSeconds!: number;

  @ApiProperty({ example: 5 })
  ipEmailTriggerMaxRequests!: number;

  @ApiProperty({ example: 900 })
  ipTokenActionWindowSeconds!: number;

  @ApiProperty({ example: 20 })
  ipTokenActionMaxRequests!: number;

  @ApiProperty({ example: 60 })
  accountVerifyResendCooldownSeconds!: number;

  @ApiProperty({ example: 60 })
  accountPasswordResetCooldownSeconds!: number;

  @ApiProperty({ example: 10 })
  accountLoginMaxFailures!: number;

  @ApiProperty({ example: 900 })
  accountLoginLockSeconds!: number;
}
```

- [ ] **Step 2: Create the update DTO**

Create `apps/api/src/settings/dto/update-rate-limit-settings.dto.ts`:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_SECONDS = 86_400;
const MAX_COUNT = 10_000;

export class UpdateRateLimitSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  ipLoginWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  ipLoginMaxRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  ipEmailTriggerWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  ipEmailTriggerMaxRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  ipTokenActionWindowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  ipTokenActionMaxRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  accountVerifyResendCooldownSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  accountPasswordResetCooldownSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  @ApiPropertyOptional()
  accountLoginMaxFailures?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SECONDS)
  @ApiPropertyOptional()
  accountLoginLockSeconds?: number;
}
```

- [ ] **Step 3: Extend `SystemSettingsDto`**

Replace the contents of `apps/api/src/settings/dto/system-settings.dto.ts` with:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { AppSettingsDto } from './app-settings.dto';
import { SmtpSettingsDto } from './smtp-settings.dto';
import { RateLimitSettingsDto } from './rate-limit-settings.dto';

export class SystemSettingsDto {
  @ApiProperty({ description: 'Application settings', type: AppSettingsDto })
  app!: AppSettingsDto;

  @ApiProperty({ description: 'SMTP settings', type: SmtpSettingsDto })
  smtp!: SmtpSettingsDto;

  @ApiProperty({ description: 'Rate-limit settings', type: RateLimitSettingsDto })
  rateLimit!: RateLimitSettingsDto;
}
```

- [ ] **Step 4: Extend `UpdateSystemSettingsDto`**

Replace `apps/api/src/settings/dto/update-system-settings.dto.ts` with:

```ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UpdateAppSettingsDto } from './update-app-settings.dto';
import { UpdateSmtpSettingsDto } from './update-smtp-settings.dto';
import { UpdateRateLimitSettingsDto } from './update-rate-limit-settings.dto';

export class UpdateSystemSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAppSettingsDto)
  @ApiPropertyOptional({ description: 'Application settings update', type: UpdateAppSettingsDto })
  app?: UpdateAppSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateSmtpSettingsDto)
  @ApiPropertyOptional({ description: 'SMTP settings update', type: UpdateSmtpSettingsDto })
  smtp?: UpdateSmtpSettingsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRateLimitSettingsDto)
  @ApiPropertyOptional({ description: 'Rate-limit settings update', type: UpdateRateLimitSettingsDto })
  rateLimit?: UpdateRateLimitSettingsDto;
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settings/dto/rate-limit-settings.dto.ts apps/api/src/settings/dto/update-rate-limit-settings.dto.ts apps/api/src/settings/dto/system-settings.dto.ts apps/api/src/settings/dto/update-system-settings.dto.ts
git commit -m "feat(api): add rate-limit settings DTOs"
```

---

## Task 10: Hook rate-limit settings into `SettingsService`

**Files:**
- Modify: `apps/api/src/settings/settings.service.ts`

- [ ] **Step 1: Read & write helpers**

Open `apps/api/src/settings/settings.service.ts`. After the existing imports add:

```ts
import { RATE_LIMIT_DEFAULTS, RATE_LIMIT_KEYS, RATE_LIMIT_PARENT } from '../rate-limit/rate-limit.constants';
import { RateLimitSettingsDto } from './dto/rate-limit-settings.dto';
import { UpdateRateLimitSettingsDto } from './dto/update-rate-limit-settings.dto';
```

Inside the class add two methods:

```ts
  async getRateLimitSettings(): Promise<RateLimitSettingsDto> {
    const readNumber = async (key: string, fallback: number): Promise<number> => {
      const raw = await this.settingsStore.getPlainSetting(RATE_LIMIT_PARENT, key);
      if (raw === null) return fallback;
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    };
    const entries = await Promise.all(
      (Object.keys(RATE_LIMIT_DEFAULTS) as Array<keyof typeof RATE_LIMIT_DEFAULTS>).map(
        async (camel) => {
          const dbKey = RATE_LIMIT_KEYS[camel];
          const value = await readNumber(dbKey, RATE_LIMIT_DEFAULTS[camel]);
          return [camel, value] as const;
        },
      ),
    );
    return Object.fromEntries(entries) as RateLimitSettingsDto;
  }

  async updateRateLimitSettings(update: UpdateRateLimitSettingsDto): Promise<RateLimitSettingsDto> {
    for (const camel of Object.keys(update) as Array<keyof UpdateRateLimitSettingsDto>) {
      const value = update[camel];
      if (value === undefined) continue;
      await this.settingsStore.setPlainSetting(
        RATE_LIMIT_PARENT,
        RATE_LIMIT_KEYS[camel],
        String(value),
      );
    }
    return this.getRateLimitSettings();
  }
```

- [ ] **Step 2: Plug into `getSystemSettings` / `updateSystemSettings`**

Update the existing `getSystemSettings` method to read the new section in parallel and include it in the returned DTO:

```ts
  async getSystemSettings(): Promise<SystemSettingsDto> {
    const [app, smtp, rateLimit] = await Promise.all([
      this.getAppSettings(),
      this.smtpSettingsService.getSettings(),
      this.getRateLimitSettings(),
    ]);
    return { app, smtp, rateLimit };
  }
```

Update `updateSystemSettings` to apply the new section when supplied:

```ts
  async updateSystemSettings(update: UpdateSystemSettingsDto): Promise<SystemSettingsDto> {
    if (update.app) {
      await this.updateAppSettings(update.app);
    }
    if (update.smtp) {
      await this.updateSmtpSettings(update.smtp);
    }
    if (update.rateLimit) {
      await this.updateRateLimitSettings(update.rateLimit);
    }
    return this.getSystemSettings();
  }
```

- [ ] **Step 3: Build the api to confirm types**

```bash
pnpm nx build api
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/settings/settings.service.ts
git commit -m "feat(api): expose rate-limit settings through SettingsService"
```

---

## Task 11: Apply login rate limit and lockout

**Files:**
- Modify: `apps/api/src/users-and-auth/auth/auth.controller.ts`
- Modify: `apps/api/src/users-and-auth/auth/auth.service.ts`
- Modify: `apps/api/src/users-and-auth/auth/auth.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

Open `apps/api/src/users-and-auth/auth/auth.service.spec.ts`. Add a new `describe('login lockout', ...)` block. Inside, mock `RateLimitService` and the user repository. Write:

```ts
  describe('login lockout', () => {
    it('rejects login when the user is currently locked', async () => {
      const lockedUser = baseUser({
        loginLockedUntil: new Date(Date.now() + 60_000),
      });
      usersService.findOne.mockResolvedValue(lockedUser);
      await expect(
        authService.validateAuthenticationDetails(lockedUser.id, {
          type: AuthenticationType.LOCAL_PASSWORD,
          details: { password: 'right-password' },
        }),
      ).resolves.toBe(false);
    });

    it('increments failure count on bad credentials and locks at threshold', async () => {
      const user = baseUser({
        failedLoginCount: RATE_LIMIT_DEFAULTS.accountLoginMaxFailures - 1,
      });
      bcryptCompare.mockResolvedValue(false);
      await authService.validateAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'wrong' },
      });
      expect(userRepository.update).toHaveBeenCalledWith(user.id, expect.objectContaining({
        failedLoginCount: 0,
        loginLockedUntil: expect.any(Date),
      }));
    });

    it('clears failure count on successful login', async () => {
      const user = baseUser({ failedLoginCount: 3 });
      bcryptCompare.mockResolvedValue(true);
      await authService.validateAuthenticationDetails(user.id, {
        type: AuthenticationType.LOCAL_PASSWORD,
        details: { password: 'correct' },
      });
      expect(userRepository.update).toHaveBeenCalledWith(user.id, {
        failedLoginCount: 0,
        loginLockedUntil: null,
      });
    });
  });
```

(Adapt `baseUser`, `bcryptCompare`, `usersService`, and `userRepository` to whatever fixtures exist in the file. If the file does not yet hold a User mock, follow the same pattern used in `apps/api/src/users-and-auth/users/resend-verification-email.spec.ts`. Import `RATE_LIMIT_DEFAULTS` and `AuthenticationType` from the appropriate modules.)

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm nx test api --no-cache --testFile=auth.service.spec.ts
```

- [ ] **Step 3: Wire `RateLimitService` and `User` repository into `AuthService`**

In `apps/api/src/users-and-auth/auth/auth.service.ts`:

1. Add imports:
   ```ts
   import { RateLimitService } from '../../rate-limit/rate-limit.service';
   ```
2. Inject `User` repository and `RateLimitService` in the constructor (mirror the existing TypeORM repo injection style).
3. Wrap the `case AuthenticationType.LOCAL_PASSWORD` body so it:
   - Loads the latest `User` row by `userId`.
   - Calls `await this.rateLimitService.checkLoginLock(user)`. If `!allowed`, return `false` without further processing.
   - On bcrypt mismatch, call `await this.rateLimitService.applyLoginFailure(user)` and persist via `await this.userRepository.update(user.id, { failedLoginCount, loginLockedUntil })`.
   - On match, call `this.rateLimitService.applyLoginSuccess(user)` and persist via `await this.userRepository.update(user.id, { failedLoginCount: 0, loginLockedUntil: null })`.

- [ ] **Step 4: Add the `RateLimitModule` to `UsersAndAuthModule` (or whatever module owns `AuthService`)**

Open the module file that declares `AuthService` (`apps/api/src/users-and-auth/users-and-auth.module.ts` or similar) and add `RateLimitModule` to its `imports` array. Import the module symbol from `../rate-limit/rate-limit.module`.

- [ ] **Step 5: Apply the decorator + interceptor on the login route**

Open `apps/api/src/users-and-auth/auth/auth.controller.ts`. Add imports:

```ts
import { UseInterceptors } from '@nestjs/common';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitInterceptor } from '../../rate-limit/rate-limit.interceptor';
```

Decorate the `createSession` handler:

```ts
  @Post('/session/local')
  @UseInterceptors(RateLimitInterceptor)
  @RateLimit({ scope: 'login', mode: '429' })
```

(Keep all existing decorators on the same handler.)

- [ ] **Step 6: Run tests, verify pass**

```bash
pnpm nx test api --no-cache --testFile=auth.service.spec.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users-and-auth/auth/auth.controller.ts apps/api/src/users-and-auth/auth/auth.service.ts apps/api/src/users-and-auth/auth/auth.service.spec.ts apps/api/src/users-and-auth/users-and-auth.module.ts
git commit -m "feat(api): rate-limit and lock account on failed logins"
```

---

## Task 12: Apply rate limit + cooldown to `resend-verification-email`

**Files:**
- Modify: `apps/api/src/users-and-auth/users/users.controller.ts`
- Modify: `apps/api/src/users-and-auth/users/resend-verification-email.spec.ts`

- [ ] **Step 1: Extend the failing test**

Open `apps/api/src/users-and-auth/users/resend-verification-email.spec.ts`. Add:

```ts
  it('does not send mail when called inside the per-account cooldown', async () => {
    user.lastVerificationEmailSentAt = new Date(Date.now() - 5_000);
    usersService.findOne.mockResolvedValue(user);
    await controller.resendVerificationEmail({ email: user.email });
    expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('updates lastVerificationEmailSentAt after a successful send', async () => {
    user.lastVerificationEmailSentAt = null;
    usersService.findOne.mockResolvedValue(user);
    await controller.resendVerificationEmail({ email: user.email });
    expect(usersService.update).toHaveBeenCalledWith(user.id, expect.objectContaining({ lastVerificationEmailSentAt: expect.any(Date) }));
  });
```

(If `usersService.update` is not the existing API, replace with the matching `userRepository.update(user.id, ...)` style already used in the controller. The controller currently has no save call in this method — Step 3 below introduces one.)

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm nx test api --no-cache --testFile=resend-verification-email.spec.ts
```

- [ ] **Step 3: Add cooldown enforcement and timestamp update in the controller**

In `apps/api/src/users-and-auth/users/users.controller.ts`:

1. Add the same `@UseInterceptors(RateLimitInterceptor)` and `@RateLimit({ scope: 'emailTrigger', mode: 'silentOk' })` decorators on the existing `resendVerificationEmail` handler.
2. Inject `RateLimitService` (and the `User` repository if not already present) into the controller constructor. (Look at `BillingTransactionsController` or any other controller that already injects a TypeORM repository for the matching pattern.)
3. After the existing "no unverified user" early return, before the email send block, add:

```ts
    const cooldown = await this.rateLimitService.accountCooldown(
      'verifyResend',
      user.lastVerificationEmailSentAt ?? null,
    );
    if (!cooldown.allowed) {
      this.logger.debug(`Resend verification cooldown active for: ${body.email}`);
      return { message: 'OK' };
    }
```

4. After a successful `sendVerificationEmail`, update the user:

```ts
    await this.userRepository.update(user.id, { lastVerificationEmailSentAt: new Date() });
```

5. Make sure `RateLimitModule` is imported in the module that declares this controller (`UsersAndAuthModule`). It already is via Task 11; confirm.

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm nx test api --no-cache --testFile=resend-verification-email.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users-and-auth/users/users.controller.ts apps/api/src/users-and-auth/users/resend-verification-email.spec.ts
git commit -m "feat(api): rate-limit and per-account cooldown on resend-verification-email"
```

---

## Task 13: Apply rate limit + cooldown to `reset-password`

**Files:**
- Modify: `apps/api/src/users-and-auth/users/users.controller.ts`
- Modify: `apps/api/src/users-and-auth/users/users.controller.spec.ts` (or create a focused spec file if more practical)

- [ ] **Step 1: Add a failing test**

Either inside the existing controller spec or in a new file `apps/api/src/users-and-auth/users/reset-password.spec.ts`, add:

```ts
  describe('requestPasswordReset (cooldown)', () => {
    it('returns OK without sending mail when within the cooldown', async () => {
      user.lastPasswordResetSentAt = new Date(Date.now() - 5_000);
      usersService.findOne.mockResolvedValue(user);
      authService.generatePasswordResetToken.mockResolvedValue('tok');
      const result = await controller.requestPasswordReset({ email: user.email });
      expect(result).toEqual({ message: 'OK' });
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('updates lastPasswordResetSentAt after a successful send', async () => {
      user.lastPasswordResetSentAt = null;
      usersService.findOne.mockResolvedValue(user);
      authService.generatePasswordResetToken.mockResolvedValue('tok');
      await controller.requestPasswordReset({ email: user.email });
      expect(userRepository.update).toHaveBeenCalledWith(user.id, expect.objectContaining({ lastPasswordResetSentAt: expect.any(Date) }));
    });
  });
```

Wire mocks (`authService`, `emailService`, `usersService`, `userRepository`) the same way the existing controller spec does.

- [ ] **Step 2: Run, verify fail**

```bash
pnpm nx test api --no-cache --testFile=users.controller.spec.ts
```

- [ ] **Step 3: Add decorator + cooldown enforcement to `requestPasswordReset`**

In `apps/api/src/users-and-auth/users/users.controller.ts`, on the `requestPasswordReset` handler:

1. Add `@UseInterceptors(RateLimitInterceptor)` and `@RateLimit({ scope: 'emailTrigger', mode: 'silentOk' })`.
2. Right after the `if (!user) { return { message: 'OK' }; }` block, before `isSSOUser` check:

```ts
    const cooldown = await this.rateLimitService.accountCooldown(
      'passwordReset',
      user.lastPasswordResetSentAt ?? null,
    );
    if (!cooldown.allowed) {
      this.logger.debug(`Password reset cooldown active for: ${body.email}`);
      return { message: 'OK' };
    }
```

3. After `sendPasswordResetEmail(user, token)`:

```ts
    await this.userRepository.update(user.id, { lastPasswordResetSentAt: new Date() });
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm nx test api --no-cache --testFile=users.controller.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users-and-auth/users/users.controller.ts apps/api/src/users-and-auth/users/users.controller.spec.ts apps/api/src/users-and-auth/users/reset-password.spec.ts
git commit -m "feat(api): rate-limit and per-account cooldown on reset-password"
```

(Drop the `reset-password.spec.ts` path from `git add` if no new file was created.)

---

## Task 14: Apply rate limit to remaining unauthenticated routes

**Files:**
- Modify: `apps/api/src/users-and-auth/users/users.controller.ts`

- [ ] **Step 1: Decorate the four remaining routes**

For each of the listed handlers, add the appropriate two decorators alongside the existing ones (do not remove anything):

| Handler                        | Scope          | Mode  |
| ------------------------------ | -------------- | ----- |
| `createOneUser` (`@Post()`)    | `emailTrigger` | `429` |
| `verifyEmail`                  | `tokenAction`  | `429` |
| `acceptInvitation`             | `tokenAction`  | `429` |
| `changePasswordViaResetToken`  | `tokenAction`  | `429` |

For each handler add:

```ts
  @UseInterceptors(RateLimitInterceptor)
  @RateLimit({ scope: '<scope>', mode: '<mode>' })
```

- [ ] **Step 2: Build the api to confirm wiring**

```bash
pnpm nx build api
```

- [ ] **Step 3: Run the api tests for users**

```bash
pnpm nx test api --no-cache --testFile=users.controller.spec.ts
```

Expected: all pass (no behavioural change for the happy paths these tests cover).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/users-and-auth/users/users.controller.ts
git commit -m "feat(api): rate-limit remaining unauthenticated user routes"
```

---

## Task 15: Regenerate API client + react-query types

**Files:**
- Generated: `libs/api-client/src/generated/Api.ts`, `libs/react-query-client/src/lib/requests/{services,schemas,types}.gen.ts`, `libs/react-query-client/src/lib/queries/{queries,common}.ts`

- [ ] **Step 1: Run the generators**

```bash
pnpm nx run api-client:generate
pnpm nx run react-query-client:generate
```

- [ ] **Step 2: Inspect `git status` and confirm only generated files changed**

```bash
git status
```

Expected: only files inside `libs/api-client/src/generated/` and `libs/react-query-client/src/lib/` are modified.

- [ ] **Step 3: Commit**

```bash
git add libs/api-client/src/generated libs/react-query-client/src/lib
git commit -m "chore: regenerate api client + react-query for rate-limit settings"
```

---

## Task 16: Frontend rate-limit settings card + form

**Files:**
- Create: `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/index.tsx`
- Create: `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/en.json`
- Create: `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/de.json`
- Create: `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/index.tsx`
- Create: `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/en.json`
- Create: `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/de.json`

- [ ] **Step 1: Create the card**

Create `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/index.tsx`:

```tsx
import { Card, CardBody, CardHeader } from '@heroui/react';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { RateLimitSettingsForm } from '../../forms/RateLimitSettingsForm';
import en from './en.json';
import de from './de.json';

export function RateLimitSettingsCard() {
  const { t } = useTranslations({ en, de });

  return (
    <Card className="flex-1 min-w-[300px]">
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldCheckIcon size={18} />} noMargin />
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <RateLimitSettingsForm />
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Card translations**

Create `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/en.json`:

```json
{
  "title": "Rate limiting",
  "subtitle": "Throttle abusive requests on unauthenticated endpoints."
}
```

Create `apps/frontend/src/app/settings/cards/RateLimitSettingsCard/de.json`:

```json
{
  "title": "Rate-Limit",
  "subtitle": "Schutz vor missbräuchlichen Anfragen auf öffentlichen Endpunkten."
}
```

- [ ] **Step 3: Create the form**

Create `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/index.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button, Input } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useSettingsServiceGetSystemSettings,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

type FormState = {
  ipLoginWindowSeconds: string;
  ipLoginMaxRequests: string;
  ipEmailTriggerWindowSeconds: string;
  ipEmailTriggerMaxRequests: string;
  ipTokenActionWindowSeconds: string;
  ipTokenActionMaxRequests: string;
  accountVerifyResendCooldownSeconds: string;
  accountPasswordResetCooldownSeconds: string;
  accountLoginMaxFailures: string;
  accountLoginLockSeconds: string;
};

const FIELD_KEYS: (keyof FormState)[] = [
  'ipLoginWindowSeconds',
  'ipLoginMaxRequests',
  'ipEmailTriggerWindowSeconds',
  'ipEmailTriggerMaxRequests',
  'ipTokenActionWindowSeconds',
  'ipTokenActionMaxRequests',
  'accountVerifyResendCooldownSeconds',
  'accountPasswordResetCooldownSeconds',
  'accountLoginMaxFailures',
  'accountLoginLockSeconds',
];

export function RateLimitSettingsForm() {
  const { t } = useTranslations({ en, de });
  const { data: settings, refetch } = useSettingsServiceGetSystemSettings();
  const updateMutation = useSettingsServiceUpdateSystemSettings({
    onSuccess: () => refetch(),
  });

  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!settings?.rateLimit) return;
    const next: FormState = {} as FormState;
    for (const key of FIELD_KEYS) {
      next[key] = String(settings.rateLimit[key]);
    }
    setForm(next);
  }, [settings]);

  if (!form) return null;

  const handleChange = (key: keyof FormState) => (value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Record<keyof FormState, number> = {} as Record<keyof FormState, number>;
    for (const key of FIELD_KEYS) {
      const parsed = Number.parseInt(form[key], 10);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      payload[key] = parsed;
    }
    updateMutation.mutate({ requestBody: { rateLimit: payload } });
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} data-testid="rate-limit-form">
      {FIELD_KEYS.map((key) => (
        <Input
          key={key}
          type="number"
          min={0}
          label={t(`fields.${key}`)}
          value={form[key]}
          onValueChange={handleChange(key)}
          data-testid={`rate-limit-${key}`}
        />
      ))}
      <Button
        type="submit"
        color="primary"
        isLoading={updateMutation.isPending}
        isDisabled={updateMutation.isPending}
        data-testid="rate-limit-save"
      >
        {t('save')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Form translations**

Create `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/en.json`:

```json
{
  "save": "Save",
  "fields": {
    "ipLoginWindowSeconds": "Login: per-IP window (seconds)",
    "ipLoginMaxRequests": "Login: per-IP max requests in window",
    "ipEmailTriggerWindowSeconds": "Email-triggering routes: per-IP window (seconds)",
    "ipEmailTriggerMaxRequests": "Email-triggering routes: per-IP max requests in window",
    "ipTokenActionWindowSeconds": "Token routes: per-IP window (seconds)",
    "ipTokenActionMaxRequests": "Token routes: per-IP max requests in window",
    "accountVerifyResendCooldownSeconds": "Resend verification: per-account cooldown (seconds)",
    "accountPasswordResetCooldownSeconds": "Password reset: per-account cooldown (seconds)",
    "accountLoginMaxFailures": "Account lockout: max failed login attempts",
    "accountLoginLockSeconds": "Account lockout: duration (seconds)"
  }
}
```

Create `apps/frontend/src/app/settings/forms/RateLimitSettingsForm/de.json`:

```json
{
  "save": "Speichern",
  "fields": {
    "ipLoginWindowSeconds": "Login: Zeitfenster pro IP (Sekunden)",
    "ipLoginMaxRequests": "Login: max. Anfragen pro IP im Zeitfenster",
    "ipEmailTriggerWindowSeconds": "E-Mail-Endpunkte: Zeitfenster pro IP (Sekunden)",
    "ipEmailTriggerMaxRequests": "E-Mail-Endpunkte: max. Anfragen pro IP im Zeitfenster",
    "ipTokenActionWindowSeconds": "Token-Endpunkte: Zeitfenster pro IP (Sekunden)",
    "ipTokenActionMaxRequests": "Token-Endpunkte: max. Anfragen pro IP im Zeitfenster",
    "accountVerifyResendCooldownSeconds": "Verifizierung erneut senden: Cooldown pro Konto (Sekunden)",
    "accountPasswordResetCooldownSeconds": "Passwort-Reset: Cooldown pro Konto (Sekunden)",
    "accountLoginMaxFailures": "Account-Sperre: max. fehlgeschlagene Logins",
    "accountLoginLockSeconds": "Account-Sperre: Dauer (Sekunden)"
  }
}
```

- [ ] **Step 5: Run frontend typecheck + lint**

```bash
pnpm nx run frontend:typecheck
pnpm nx run frontend:lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/settings/cards/RateLimitSettingsCard apps/frontend/src/app/settings/forms/RateLimitSettingsForm
git commit -m "feat(frontend): rate-limit settings card and form"
```

---

## Task 17: Wire the card into the settings page

**Files:**
- Modify: `apps/frontend/src/app/settings/index.tsx`

- [ ] **Step 1: Add import + render**

Open `apps/frontend/src/app/settings/index.tsx`. Replace the file contents with:

```tsx
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Settings2Icon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import en from './en.json';
import de from './de.json';
import { AppSettingsCard } from './cards/AppSettingsCard';
import { SmtpSettingsCard } from './cards/SmtpSettingsCard';
import { MetricsSettingsCard } from './cards/MetricsSettingsCard';
import { RateLimitSettingsCard } from './cards/RateLimitSettingsCard';

export function SystemSettingsPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />
      <div className="flex flex-row flex-wrap gap-4">
        <AppSettingsCard variant="standalone" />
        <SmtpSettingsCard variant="standalone" />
        <MetricsSettingsCard />
        <RateLimitSettingsCard />
      </div>
    </div>
  );
}

export default SystemSettingsPage;
```

- [ ] **Step 2: Verify in the running app**

Bring the dev stack up (mailpit already runs from earlier task). In one terminal:

```bash
pnpm services up mailpit
pnpm nx serve api &
pnpm nx serve frontend &
```

Visit `http://localhost:4200` → log in as the verified admin → navigate to System settings → confirm the new "Rate limiting" card appears with all ten fields populated from defaults. Change one value, save, refresh — confirm it persisted.

Then stop the servers.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/settings/index.tsx
git commit -m "feat(frontend): show rate-limit settings card on system settings page"
```

---

## Task 18: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Boot the stack**

```bash
pnpm services up mailpit
pnpm nx serve api &
pnpm nx serve frontend &
```

Wait until `curl -s http://localhost:3000/api/info` returns `200`.

- [ ] **Step 2: Resend verification spam test**

Register `ratelimit-test@example.com` from the signup form. Then issue 10 rapid resend requests:

```bash
for i in $(seq 1 10); do
  curl -s -X POST http://localhost:3000/api/users/resend-verification-email \
    -H 'Content-Type: application/json' \
    -d '{"email":"ratelimit-test@example.com"}'
  echo
done
```

Open `http://localhost:8025` (mailpit). Confirm only **one** new verification mail landed within the cooldown window.

- [ ] **Step 3: Per-IP login lock test**

Issue 11 wrong-password attempts in a row:

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/auth/session/local \
    -H 'Content-Type: application/json' \
    -d '{"username":"ratelimit-test","password":"wrong","tokenLocation":"cookie"}'
done
```

Expected: at least one `429` toward the end (per-IP throttle), and a final `401`/`403` even with the correct password (account lock).

- [ ] **Step 4: Tear down**

Stop the dev servers and stop mailpit:

```bash
pnpm services down
```

- [ ] **Step 5: Commit notes (optional)**

If anything in `docs/` changed during verification, commit those updates. Otherwise no further commits are needed.

---

## Self-review pointers (run before declaring the plan done)

- Spec coverage: every threshold in the spec maps to a `RATE_LIMIT_DEFAULTS` entry and a settings field; every endpoint in the spec table has a Task 11–14 step touching it.
- Type consistency: `RateLimitDecision`, `RateLimitMetadata`, and `RateLimitMode` are defined once in `rate-limit.types.ts` and imported everywhere else. The `accountCooldown(kind, lastSentAt)` signature is stable from Task 3 through Task 13.
- All TDD steps include explicit code blocks; no "see above" or "similar to" placeholders.
