import '@testing-library/jest-dom/vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@attraccess/react-query-client';
import { useDebounce } from '../../hooks/useDebounce';
import { groupUsersByLetter } from './UserSearch.utils';
import { UserSearch } from './UserSearch';

// Mock the generated api client: its sources do not exist in hermetic test runs,
// and the component under test only needs the infinite users hook.
const mocks = vi.hoisted(() => ({ useUsersServiceFindManyInfinite: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useUsersServiceFindManyInfinite: mocks.useUsersServiceFindManyInfinite,
}));

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

  it('merges non-contiguous same-letter runs and sorts groups alphabetically', () => {
    // Robustness against case-sensitive collations / legacy mixed-case rows:
    // grouping must not depend on the server delivering contiguous letter runs.
    const groups = groupUsersByLetter([user(1, 'Zoe'), user(2, 'alan'), user(3, 'anna'), user(4, 'zack')]);

    expect(groups).toEqual([
      { letter: 'A', users: [user(2, 'alan'), user(3, 'anna')] },
      { letter: 'Z', users: [user(1, 'Zoe'), user(4, 'zack')] },
    ]);
  });

  it('falls back to # for empty usernames and returns no groups for no users', () => {
    expect(groupUsersByLetter([])).toEqual([]);
    expect(groupUsersByLetter([user(1, '')])).toEqual([{ letter: '#', users: [user(1, '')] }]);
  });
});

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only exposes the new value after the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
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
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
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

describe('UserSearch', () => {
  let intersectionCallback: IntersectionObserverCallback | null = null;
  let observerConstructions = 0;

  const infiniteQueryResult = (users: User[], overrides: Record<string, unknown> = {}) => ({
    data: { pages: [{ data: users, total: users.length, page: 1, limit: 50, nextPage: 2 }] },
    fetchNextPage: vi.fn(),
    hasNextPage: true,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    intersectionCallback = null;
    observerConstructions = 0;
    class IntersectionObserverStub {
      constructor(cb: IntersectionObserverCallback) {
        intersectionCallback = cb;
        observerConstructions += 1;
      }
      observe() {
        /* noop */
      }
      unobserve() {
        /* noop */
      }
      disconnect() {
        /* noop */
      }
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch until opened, then lists grouped users and selects on click', async () => {
    const result = infiniteQueryResult([user(1, 'alan'), user(2, 'bob')]);
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(result);
    const onSelectionChange = vi.fn();
    const pointer = userEvent.setup();

    render(<UserSearch onSelectionChange={onSelectionChange} />);

    // Query is gated on the picker being open
    expect(mocks.useUsersServiceFindManyInfinite).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({ enabled: false }),
    );

    await pointer.click(screen.getByRole('button', { name: /choose user/i }));

    expect(mocks.useUsersServiceFindManyInfinite).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({ enabled: true }),
    );

    // Address-book list with letter groups and options
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();

    await pointer.click(screen.getByRole('option', { name: /bob/i }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(user(2, 'bob'));
    // Modal closed, trigger swapped for the selected-user chip
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('fetches the next page when the sentinel intersects', async () => {
    const result = infiniteQueryResult([user(1, 'alan')]);
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(result);
    const pointer = userEvent.setup();

    render(<UserSearch />);
    await pointer.click(screen.getByRole('button', { name: /choose user/i }));

    expect(intersectionCallback).not.toBeNull();
    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        null as unknown as IntersectionObserver,
      );
    });

    expect(result.fetchNextPage).toHaveBeenCalled();
  });

  it.each([
    ['no further pages exist', { hasNextPage: false }],
    ['a fetch is already in flight', { isFetchingNextPage: true }],
  ])('does not fetch when %s', async (_label, overrides) => {
    const result = infiniteQueryResult([user(1, 'alan')], overrides);
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(result);
    const pointer = userEvent.setup();

    render(<UserSearch />);
    await pointer.click(screen.getByRole('button', { name: /choose user/i }));

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        null as unknown as IntersectionObserver,
      );
    });

    expect(result.fetchNextPage).not.toHaveBeenCalled();
  });

  it('shows a retry-able error state instead of the empty message when loading fails', async () => {
    const result = infiniteQueryResult([], { isError: true });
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(result);
    const pointer = userEvent.setup();

    render(<UserSearch />);
    await pointer.click(screen.getByRole('button', { name: /choose user/i }));

    expect(screen.getByText('Users could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText('No users found')).not.toBeInTheDocument();

    await pointer.click(screen.getByRole('button', { name: /try again/i }));
    expect(result.refetch).toHaveBeenCalled();
  });

  it('clears the selection when resetSignal changes identity', async () => {
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(infiniteQueryResult([user(1, 'alan')]));
    const onSelectionChange = vi.fn();
    const pointer = userEvent.setup();

    const { rerender } = render(<UserSearch resetSignal={true} onSelectionChange={onSelectionChange} />);
    await pointer.click(screen.getByRole('button', { name: /choose user/i }));
    await pointer.click(screen.getByRole('option', { name: /alan/i }));
    expect(screen.getByText('alan')).toBeInTheDocument();

    rerender(<UserSearch resetSignal={false} onSelectionChange={onSelectionChange} />);

    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText('alan')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose user/i })).toBeInTheDocument();
  });

  it('keeps loaded users and offers an inline retry when a later page fails', async () => {
    const result = infiniteQueryResult([user(1, 'alan'), user(2, 'bob')], { isError: true });
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(result);
    const pointer = userEvent.setup();

    render(<UserSearch />);
    await pointer.click(screen.getByRole('button', { name: /choose user/i }));

    // The already-loaded list survives the error; only an inline retry row is added.
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('Users could not be loaded.')).toBeInTheDocument();

    await pointer.click(screen.getByRole('button', { name: /try again/i }));
    expect(result.fetchNextPage).toHaveBeenCalled();
    expect(result.refetch).not.toHaveBeenCalled();
  });

  it('re-observes the sentinel after a retried error clears', async () => {
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(infiniteQueryResult([user(1, 'alan')], { isError: true }));
    const pointer = userEvent.setup();

    const { rerender } = render(<UserSearch />);
    await pointer.click(screen.getByRole('button', { name: /choose user/i }));
    const constructionsWhileErrored = observerConstructions;

    // Error clears (successful retry) -> a fresh sentinel mounts and must be observed again.
    mocks.useUsersServiceFindManyInfinite.mockReturnValue(infiniteQueryResult([user(1, 'alan')]));
    rerender(<UserSearch />);

    expect(observerConstructions).toBeGreaterThan(constructionsWhileErrored);

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        null as unknown as IntersectionObserver,
      );
    });
    expect(mocks.useUsersServiceFindManyInfinite.mock.results.at(-1)?.value.fetchNextPage).toHaveBeenCalled();
  });
});
