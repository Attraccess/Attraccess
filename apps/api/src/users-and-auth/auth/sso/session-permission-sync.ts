import type { SSOProvider, SsoSessionContext } from '@attraccess/database-entities';
import { LogoutSession } from '../session-store/session-store';

/** `skipped` means no IdP call was made; every other outcome is one logged re-sync attempt. */
export type SessionPermissionSyncOutcome = 'skipped' | 'unchanged' | 'updated' | 'failed' | 'revoked';

export type RoleDelta = { added: string[]; removed: string[]; updated: string[] };

/**
 * Injection token for session-time SSO permission re-sync. Kept free of IdP client imports
 * (jose, axios) so SessionStrategy stays loadable by plugin test hosts that compose it.
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
