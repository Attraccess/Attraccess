import type { UserDisplayNameParts } from '@attraccess/shared';

/** Initials from the first and last name when set, otherwise the first two characters of the username. */
export function getUserInitials(user: UserDisplayNameParts): string {
  const parts = [user.firstName, user.lastName].map((part) => part?.trim() ?? '').filter(Boolean);
  if (parts.length > 0) {
    return parts
      .map((part) => Array.from(part)[0])
      .join('')
      .toUpperCase();
  }
  return user.username.slice(0, 2).toUpperCase();
}
