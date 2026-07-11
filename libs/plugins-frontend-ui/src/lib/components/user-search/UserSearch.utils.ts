// Pure helpers for the UserSearch address-book picker. Kept free of runtime
// imports from the generated API client so unit tests stay hermetic.
import { useEffect, useState } from 'react';
import type { User } from '@attraccess/react-query-client';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export interface UserGroup {
  letter: string;
  users: User[];
}

// The API returns users sorted by username (ASC), so equal-letter runs are contiguous
// and a single pass produces the address-book groups.
export function groupUsersByLetter(users: User[]): UserGroup[] {
  const out: UserGroup[] = [];
  for (const user of users) {
    const letter = (user.username?.[0] ?? '#').toUpperCase();
    const last = out[out.length - 1];
    if (last && last.letter === letter) {
      last.users.push(user);
    } else {
      out.push({ letter, users: [user] });
    }
  }
  return out;
}
