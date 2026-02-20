import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { SettingsService } from '../../../../settings/settings.service';
import { AppConfigType } from '../../../../config/app.config';

export const OIDC_STATE_COOKIE_NAME = 'oidc-state';

/** Request key where redirectTo from OIDC state is attached after callback verification. */
export const SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY = '_ssoOidcRedirectFromState';

/** How long (ms) the oidc-state cookie is valid — enough to complete the IdP login flow. */
const OIDC_STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

interface OidcStateCtx {
  nonce?: string;
  maxAge?: number;
  /** ISO 8601 string — Date is not JSON-serialisable, so we convert it. */
  issued?: string;
}

interface OidcStateCookiePayload {
  handle: string;
  ctx: OidcStateCtx;
  appState?: unknown;
}

/**
 * A cookie-based StateStore for passport-openidconnect.
 *
 * Replaces the default express-session store for OIDC state (state + nonce).
 * The cookie is set with `SameSite=Lax` because it must be present when the
 * IdP redirects the browser back to the app — a cross-site top-level GET
 * navigation that `SameSite=Strict` would silently block.
 *
 * The cookie value is HMAC-SHA256 signed with `AUTH_SESSION_SECRET` to prevent
 * client-side forgery. It is single-use: cleared immediately on `verify()`.
 *
 * Cookie format:  base64url(JSON(payload)) + "." + HMAC-SHA256(data, secret)
 */
@Injectable()
export class OidcCookieStateStore {
  private readonly logger = new Logger(OidcCookieStateStore.name);
  private readonly secret: string;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {
    const appConfig = this.configService.get<AppConfigType>('app');
    this.secret = appConfig?.AUTH_SESSION_SECRET ?? '';
    if (!this.secret) {
      this.logger.error(
        'AUTH_SESSION_SECRET is not configured — OIDC state cookies will use an empty signing key.',
      );
    }
  }

  /**
   * Called before redirecting to the IdP.
   *
   * Generates a random `handle` (sent to the IdP as the `state` query param),
   * stores the OIDC context (nonce, maxAge, issued) in a signed cookie, and
   * calls `cb(null, handle)`.
   *
   * Implements the `StateStore#store(req, ctx, appState, meta, cb)` interface
   * from passport-openidconnect.
   */
  store(
    req: Request,
    ctx: { nonce?: string; maxAge?: number; issued?: string | Date },
    appState: unknown,
    _meta: unknown,
    cb: (err: Error | null, handle: string) => void,
  ): void {
    const handle = crypto.randomBytes(18).toString('base64url');

    const payload: OidcStateCookiePayload = {
      handle,
      ctx: {
        nonce: ctx.nonce,
        maxAge: ctx.maxAge,
        issued: ctx.issued instanceof Date ? ctx.issued.toISOString() : ctx.issued,
      },
      appState,
    };

    this.settingsService
      .getUrl()
      .then((url) => {
        const secure = url?.startsWith('https://') ?? false;
        const res = (req as Request & { res: Response }).res;

        res.cookie(OIDC_STATE_COOKIE_NAME, this.signPayload(payload), {
          httpOnly: true,
          secure,
          sameSite: 'lax', // always lax — must survive the IdP cross-site redirect
          maxAge: OIDC_STATE_COOKIE_MAX_AGE_MS,
          path: '/',
        });

        cb(null, handle);
      })
      .catch((err: Error) => cb(err, ''));
  }

  /**
   * Called on the IdP callback.
   *
   * Reads and immediately clears the oidc-state cookie (single-use), verifies
   * the HMAC, and checks that the handle matches the `state` param returned by
   * the IdP. On success calls `cb(null, ctx, appState)`; on any failure calls
   * `cb(null, false, { message })` so passport can return a proper 401.
   *
   * Implements the `StateStore#verify(req, handle, cb)` interface from
   * passport-openidconnect.
   */
  verify(
    req: Request,
    handle: string,
    cb: (err: Error | null, ctx: unknown, appState?: unknown) => void,
  ): void {
    const cookieValue = (req.cookies as Record<string, string | undefined>)[OIDC_STATE_COOKIE_NAME];

    // Single-use: clear regardless of success or failure
    const res = (req as Request & { res: Response }).res;
    res.clearCookie(OIDC_STATE_COOKIE_NAME, { path: '/' });

    if (!cookieValue) {
      this.logger.warn('OIDC state cookie missing on callback — cookie may be blocked or login expired');
      return cb(null, false as unknown as null, {
        message: 'OIDC state cookie is missing. The login session may have expired or cookies are being blocked.',
      });
    }

    const payload = this.verifyAndParse(cookieValue);
    if (!payload) {
      this.logger.warn('OIDC state cookie HMAC verification failed — possible tampering or key rotation');
      return cb(null, false as unknown as null, {
        message: 'OIDC state cookie is invalid or has been tampered with.',
      });
    }

    if (payload.handle !== handle) {
      this.logger.warn(`OIDC state handle mismatch: cookie=${payload.handle}, IdP returned=${handle}`);
      return cb(null, false as unknown as null, {
        message: 'OIDC state parameter mismatch.',
      });
    }

    const ctx: { nonce?: string; maxAge?: number; issued?: Date } = {
      nonce: payload.ctx.nonce,
      maxAge: payload.ctx.maxAge,
      issued: payload.ctx.issued ? new Date(payload.ctx.issued) : undefined,
    };

    if (payload.appState && typeof payload.appState === 'object' && 'redirectTo' in (payload.appState as object)) {
      (req as unknown as Record<string, unknown>)[SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY] =
        (payload.appState as { redirectTo?: string }).redirectTo;
    }

    cb(null, ctx, payload.appState);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private signPayload(payload: OidcStateCookiePayload): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  private verifyAndParse(value: string): OidcStateCookiePayload | null {
    const dotIdx = value.lastIndexOf('.');
    if (dotIdx === -1) return null;

    const data = value.slice(0, dotIdx);
    const sig = value.slice(dotIdx + 1);

    try {
      const expected = Buffer.from(
        crypto.createHmac('sha256', this.secret).update(data).digest('base64url'),
      );
      const actual = Buffer.from(sig);

      if (expected.length !== actual.length) return null;
      if (!crypto.timingSafeEqual(expected, actual)) return null;
    } catch {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as OidcStateCookiePayload;
    } catch {
      return null;
    }
  }
}
