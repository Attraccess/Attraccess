import type { SSOProvider, SsoSessionContext } from '@attraccess/database-entities';
import { LogoutSession } from '../session-store/session-store';

/** `skipped` means no IdP call was made; every other outcome is one logged re-sync attempt. */
export type SessionPermissionSyncOutcome = 'skipped' | 'unchanged' | 'updated' | 'failed' | 'revoked';

export type RoleDelta = { added: string[]; removed: string[]; updated: string[] };

/**
 * Injection token for session-time SSO permission re-sync. Kept free of IdP client imports
 * (jose, axios) so SessionStrategy stays loadable by plugin test hosts that compose it.
 *
 * It is a required dependency of SessionStrategy and AuthController: a module without a provider
 * fails at startup instead of silently turning session-time revocation off.
 *
 * Failure behaviour of `syncIfDue`:
 * - Temporary IdP or network error (the resyncer throws anything but SessionRejectedError): outcome
 *   `failed`. The session and current roles are kept, a 60 s retry backoff is stored in
 *   `ssoSyncRetryAt` (best effort: if storing it fails, the next attempt waits the normal interval)
 *   and the request continues.
 * - The IdP rejects the session (SessionRejectedError): outcome `revoked`. The session is revoked and
 *   the caller rejects this request, even if removing the stored session fails (fails closed).
 * - Implementations must never throw: SsoSessionPermissionSyncService catches every other error
 *   and returns `skipped`. If an implementation throws anyway, callers do not catch it: the error
 *   propagates and the request is not authenticated (fails closed at the caller).
 *
 * inheritance: abstract only to serve as the DI token that SsoSessionPermissionSyncService implements;
 * nothing extends it.
 */
export abstract class SessionPermissionSync {
  abstract syncIfDue(
    session: LogoutSession,
    userId: number,
    options?: { force?: boolean },
  ): Promise<SessionPermissionSyncOutcome>;
}

/** The IdP no longer vouches for the session (e.g. invalid_grant or a different subject). */
export class SessionRejectedError extends Error {}

/** Protocol-specific part of a re-sync: talks to the IdP and maps the claims it returns to roles. */
export interface SessionPermissionResyncer {
  readonly protocol: SsoSessionContext['protocol'];
  /** The provider and its own interval override, or null when it is gone or has no usable configuration. */
  loadProvider(providerId: number): Promise<{ provider: SSOProvider; permissionSyncTtlMinutes?: number | null } | null>;
  /** Whether the session holds what this protocol needs to re-sync (OIDC: a refresh token). */
  canResync(context: SsoSessionContext): boolean;
  /**
   * Returns the role delta. `patchContext` persists changes to the session's SSO context (e.g. a
   * rotated refresh token). Throws SessionRejectedError when the IdP rejects the session.
   */
  resync(args: {
    context: SsoSessionContext;
    userId: number;
    provider: SSOProvider;
    patchContext: (patch: Partial<SsoSessionContext>) => Promise<void>;
  }): Promise<RoleDelta>;
}

/** Multi-provider token: one resyncer per protocol that supports session-time re-sync. */
export const SESSION_PERMISSION_RESYNCERS = Symbol('SESSION_PERMISSION_RESYNCERS');

/** The provider's re-sync interval; null or 0 means re-sync is off. */
export function resolvePermissionSyncIntervalMinutes(config: { permissionSyncTtlMinutes?: number | null }): number {
  return config.permissionSyncTtlMinutes ?? 0;
}
