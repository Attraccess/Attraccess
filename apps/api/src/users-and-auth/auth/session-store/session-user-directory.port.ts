import type { AuthenticatedSessionUser } from '@attraccess/application-models';

/** Loads the account a session token belongs to, for session stores that keep sessions outside the database. */
export const SESSION_USER_DIRECTORY = Symbol.for('attraccess.auth.session-user-directory');

export interface SessionUserDirectory {
  findSessionUser(userId: number): Promise<AuthenticatedSessionUser | null>;
}
