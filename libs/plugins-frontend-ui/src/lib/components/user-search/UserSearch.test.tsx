import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@attraccess/react-query-client';
import { groupUsersByLetter, useDebouncedValue } from './UserSearch';

const user = (id: number, username: string) => ({ id, username }) as User;

describe('groupUsersByLetter', () => {
  it('groups contiguous username-sorted users by their uppercased first letter', () => {
    const groups = groupUsersByLetter([
      user(1, 'alan'),
      user(2, 'alice'),
      user(3, 'bob'),
      user(4, 'brian'),
      user(5, 'carol'),
    ]);

    expect(groups).toEqual([
      { letter: 'A', users: [user(1, 'alan'), user(2, 'alice')] },
      { letter: 'B', users: [user(3, 'bob'), user(4, 'brian')] },
      { letter: 'C', users: [user(5, 'carol')] },
    ]);
  });

  it('merges only contiguous runs, mirroring the API sort contract', () => {
    // If the API ever stopped sorting by username, groups would split like this
    // instead of merging — the UI depends on contiguity, not on re-sorting.
    const groups = groupUsersByLetter([user(1, 'alan'), user(2, 'bob'), user(3, 'anna')]);

    expect(groups.map((g) => g.letter)).toEqual(['A', 'B', 'A']);
  });

  it('falls back to # for empty usernames and returns no groups for no users', () => {
    expect(groupUsersByLetter([])).toEqual([]);
    expect(groupUsersByLetter([user(1, '')])).toEqual([{ letter: '#', users: [user(1, '')] }]);
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only exposes the new value after the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    expect(result.current).toBe('a');

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('ab');
  });

  it('restarts the delay when the value keeps changing', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 400ms total, but only 200ms since the last change — still the original value.
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('abc');
  });
});
