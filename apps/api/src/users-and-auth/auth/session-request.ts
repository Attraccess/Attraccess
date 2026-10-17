import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { LogoutSession } from './session-store/session-store';

/** Set by the session strategy from the same storage read that authenticates the token. */
export type SessionAuthenticatedRequest = AuthenticatedRequest & { authSession?: LogoutSession };
