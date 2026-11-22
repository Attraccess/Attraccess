// Pure helpers for the UserSearch address-book picker. Kept free of runtime
// imports from the generated API client so unit tests stay hermetic.
import { formatUserDisplayName } from '@attraccess/shared';
import type { UserIdentity } from '../attraccess-user/AttraccessUser';

export interface UserGroup {
  letter: string;
  users: UserIdentity[];
}

// The API returns users sorted by display name (ASC, case-insensitive). Merge by letter instead of relying on
// contiguous runs so the grouping stays correct even for legacy mixed-case rows
// or a case-sensitive database collation. Grouping uses the display name.
export function groupUsersByLetter(users: UserIdentity[]): UserGroup[] {
  const byLetter = new Map<string, UserIdentity[]>();
  for (const user of users) {
    const letter = (Array.from(formatUserDisplayName(user))[0] ?? '#').toUpperCase();
    const group = byLetter.get(letter);
    if (group) {
      group.push(user);
    } else {
      byLetter.set(letter, [user]);
    }
  }
  return [...byLetter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, groupedUsers]) => ({ letter, users: groupedUsers }));
}
