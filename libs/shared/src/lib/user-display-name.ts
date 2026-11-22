/** The parts of a user that make up its display name. Names are optional, the username always exists. */
export interface UserDisplayNameParts {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
}

/**
 * The name to show for a user: "First Last", only the part that is set, or the username when neither is.
 * The order is never changed by locale.
 */
export function formatUserDisplayName({ firstName, lastName, username }: UserDisplayNameParts): string {
  const name = [firstName, lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  return name.length > 0 ? name : username;
}

/**
 * The display name of a user projection whose username may be missing (a partial or not loaded user): undefined when
 * neither a name nor a username is known, so callers can fall back to their own text.
 */
export function optionalUserDisplayName(
  user: { firstName?: string | null; lastName?: string | null; username?: string | null } | null | undefined,
): string | undefined {
  if (!user) return undefined;
  return (
    formatUserDisplayName({ firstName: user.firstName, lastName: user.lastName, username: user.username ?? '' }) ||
    undefined
  );
}

/** Whether the user has a name, so the username is worth showing as secondary text. */
export function hasUserName({ firstName, lastName }: Pick<UserDisplayNameParts, 'firstName' | 'lastName'>): boolean {
  return Boolean(firstName?.trim() || lastName?.trim());
}
