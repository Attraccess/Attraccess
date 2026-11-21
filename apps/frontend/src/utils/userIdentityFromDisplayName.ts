/**
 * A user identity for `AttraccessUser` built from the flat `username` and `displayName` fields of a DTO that does not
 * carry first and last name. The display name stands in for the name, so the username shows as secondary text only
 * when a name is set.
 */
export function userIdentityFromDisplayName(user: { id: number; username: string; displayName?: string | null }) {
  const hasName = !!user.displayName && user.displayName !== user.username;
  return {
    id: user.id,
    username: user.username,
    firstName: hasName ? (user.displayName as string) : null,
    lastName: null,
  };
}
