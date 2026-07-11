// Pure helpers for the UserSearch address-book picker. Kept free of runtime
// imports from the generated API client so unit tests stay hermetic.
import type { User } from '@attraccess/react-query-client';

export interface UserGroup {
  letter: string;
  users: User[];
}

// The API returns users sorted by username (ASC). Usernames are normalized to
// lowercase on every write path, but merge by letter instead of relying on
// contiguous runs so the grouping stays correct even for legacy mixed-case rows
// or a case-sensitive database collation.
export function groupUsersByLetter(users: User[]): UserGroup[] {
  const byLetter = new Map<string, User[]>();
  for (const user of users) {
    const letter = (user.username?.[0] ?? '#').toUpperCase();
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
