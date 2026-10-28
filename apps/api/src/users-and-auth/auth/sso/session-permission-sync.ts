import { LogoutSession } from '../session-store/session-store';

/** `skipped` means no IdP call was made; every other outcome is one logged re-sync attempt. */
export type SessionPermissionSyncOutcome = 'skipped' | 'unchanged' | 'updated' | 'failed' | 'revoked';

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
