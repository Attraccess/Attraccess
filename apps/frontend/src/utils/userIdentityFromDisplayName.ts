/** "First Rest": a first word, one whitespace, and a rest that neither starts nor ends with whitespace. */
const FIRST_AND_REST = /^(\S+)\s(\S(?:[\s\S]*\S)?)$/;

/**
 * A user identity for `AttraccessUser` built from the flat `username` and `displayName` fields of a DTO that does not
 * carry first and last name. The display name stands in for the name, split at its first whitespace so the initials
 * come from both parts and `formatUserDisplayName` gives back the same string. The username shows as secondary text
 * only when a name is set.
 */
export function userIdentityFromDisplayName(user: { id: number; username: string; displayName?: string | null }) {
  const hasName = !!user.displayName && user.displayName !== user.username;
  const name = hasName ? (user.displayName as string) : null;
  const parts = name ? FIRST_AND_REST.exec(name) : null;
  return {
    id: user.id,
    username: user.username,
    firstName: parts ? parts[1] : name,
    lastName: parts ? parts[2] : null,
  };
}
