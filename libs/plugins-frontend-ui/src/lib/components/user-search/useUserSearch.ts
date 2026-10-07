import { PaginatedUsersResponseDto, useUsersServiceFindManyInfinite } from '@attraccess/react-query-client';
import { InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { type UserIdentity } from '../attraccess-user/AttraccessUser';
import { groupUsersByLetter } from './UserSearch.utils';

import type { UserSearchProps } from './UserSearch.types';
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export function useUserSearch({
  isOpen,
  open,
  close,
  resetSignal,
  onSelectionChange,
}: {
  isOpen: boolean;
  open: () => void;
  close: () => void;
} & Pick<UserSearchProps, 'resetSignal' | 'onSelectionChange'>) {
  const [selectedUser, setSelectedUser] = useState<UserIdentity | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  // Reset selection and search when the caller's reset signal changes (skipping the
  // initial render), replacing the per-consumer key-remount workaround.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSelectedUser(null);
    setSearch('');
  }, [resetSignal]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching, isLoading, isError, refetch } =
    useUsersServiceFindManyInfinite<InfiniteData<PaginatedUsersResponseDto>>(
      // Gate on the picker being open AND the live input being non-empty: closing
      // resets `search` synchronously while the debounced copy lags ~300ms, so
      // without the live check a quick close+reopen could briefly refetch (or flash
      // cached results for) the previous filter.
      {
        limit: PAGE_SIZE,
        search: isOpen && search.trim() ? debouncedSearch.trim() || undefined : undefined,
      },
      undefined,
      {
        // Only fetch while the picker is actually open. The generated options type
        // marks initialPageParam/getNextPageParam as required (they are not Omit-ed),
        // so `enabled` cannot be passed alone — mirror the hook's own values verbatim.
        // The cast matches the generated hook: at runtime lastPage is the raw
        // PaginatedUsersResponseDto even though the type parameter says otherwise.
        enabled: isOpen,
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage as unknown as { nextPage?: number }).nextPage,
      },
    );

  // De-duplicate by id: pagination is offset-based, so a user created or renamed
  // between page fetches can shift the window and repeat (or skip) a row.
  const users = useMemo(() => {
    const seen = new Map<number, UserIdentity>();
    for (const page of data?.pages ?? []) {
      for (const user of page.data) {
        seen.set(user.id, user);
      }
    }
    return [...seen.values()];
  }, [data]);
  const groups = useMemo(() => groupUsersByLetter(users), [users]);

  useEffect(() => {
    onSelectionChange?.(selectedUser);
  }, [selectedUser, onSelectionChange]);

  const handleSelect = useCallback(
    (user: UserIdentity) => {
      setSelectedUser(user);
      setSearch('');
      close();
    },
    [close],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        open();
      } else {
        setSearch('');
        close();
      }
    },
    [open, close],
  );

  // Infinite scroll: load more when the sentinel near the bottom of the scrollable
  // list becomes visible. The list itself is the scroll root (see inline style below).
  // A single observer lives for the whole time the picker is open; the fetch state is
  // read through refs so pagination changes don't tear the observer down.
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pagingRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  useEffect(() => {
    pagingRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  });
  useEffect(() => {
    const el = sentinelRef.current;
    const root = listRef.current;
    if (!el || !root || !isOpen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const paging = pagingRef.current;
        if (entries[0]?.isIntersecting && paging.hasNextPage && !paging.isFetchingNextPage) {
          paging.fetchNextPage();
        }
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // isError is a dependency because the sentinel unmounts while errored; when a
    // retry clears the error, the effect must re-run to observe the fresh sentinel.
  }, [isOpen, isError]);

  return {
    selectedUser,
    setSelectedUser,
    search,
    setSearch,
    users,
    groups,
    handleSelect,
    handleOpenChange,
    listRef,
    sentinelRef,
    isError,
    isLoading,
    isFetching,
    refetch,
    isFetchingNextPage,
    fetchNextPage,
  };
}
