// Address-book style user picker: a "Choose user" button that opens a searchable,
// alphabetically grouped, infinitely scrolling modal of all users.
// FEATURE: User selection via a phone-address-book modal
import { HTMLAttributes, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Button,
  Header,
  InputGroup,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  Spinner,
  TextField,
  useOverlayState,
} from '@heroui/react';
import { SearchIcon, UserPlusIcon } from 'lucide-react';
import { useTranslations } from '../../i18n';
import { useDebounce } from '../../hooks/useDebounce';
import { AttraccessUser } from '../attraccess-user/AttraccessUser';
import { groupUsersByLetter } from './UserSearch.utils';
import { User, useUsersServiceFindManyInfinite } from '@attraccess/react-query-client';

import en from './en.json';
import de from './de.json';

interface UserSearchProps {
  label?: string;
  placeholder?: string;
  onSelectionChange?: (user: User | null) => void;
  wrapperProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children'>;
  afterAutocomplete?: React.ReactNode;
  afterSelection?: React.ReactNode;
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

// Mirrors the app's StandardModal chrome (bg-surface-secondary + field-contrast
// vars) so fields inside this modal match every other modal in the app. The lib
// cannot import the app-level StandardModal (apps depend on libs, not vice versa).
const FIELD_CONTRAST_STYLE: React.CSSProperties = {
  ['--field-border' as never]: 'var(--border-secondary)',
  ['--border-width-field' as never]: '1px',
};

export function UserSearch(props: Readonly<UserSearchProps>) {
  const { label, placeholder, onSelectionChange, afterAutocomplete, wrapperProps, afterSelection } = props;

  const { t } = useTranslations({ en, de });

  // Associate the standalone field label with the trigger button so screen
  // readers announce e.g. "User, Choose user, button" instead of the bare button text.
  const labelId = useId();
  const triggerId = useId();

  const { isOpen, open, close } = useOverlayState();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useUsersServiceFindManyInfinite(
    { limit: PAGE_SIZE, search: debouncedSearch.trim() || undefined },
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

  const users = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const groups = useMemo(() => groupUsersByLetter(users), [users]);

  useEffect(() => {
    onSelectionChange?.(selectedUser);
  }, [selectedUser, onSelectionChange]);

  const handleSelect = useCallback(
    (user: User) => {
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
  // isFetchingNextPage toggling after each page recreates the observer, which re-fires
  // the callback with the current intersection state and keeps consecutive pages
  // loading even when the sentinel never leaves the viewport.
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    const root = listRef.current;
    if (!el || !root || !isOpen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div {...wrapperProps}>
      <Label id={labelId} className="mb-1 block">
        {label ?? t('label')}
      </Label>

      <div className="flex gap-2 items-center">
        {selectedUser ? (
          <Button
            variant="ghost"
            onPress={open}
            className="justify-start px-2"
            id={triggerId}
            aria-labelledby={`${labelId} ${triggerId}`}
            data-cy="user-picker-selected"
          >
            <AttraccessUser user={selectedUser} interactive={false} />
          </Button>
        ) : (
          <Button
            variant="secondary"
            onPress={open}
            className="flex-1 justify-start"
            id={triggerId}
            aria-labelledby={`${labelId} ${triggerId}`}
            data-cy="user-picker-open"
          >
            <UserPlusIcon className="w-4 h-4" />
            {t('chooseUser')}
          </Button>
        )}
        {afterAutocomplete}
        {selectedUser ? afterSelection : null}
      </div>

      <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
        <ModalBackdrop>
          <ModalContainer size="md">
            <ModalDialog className="bg-surface-secondary" style={FIELD_CONTRAST_STYLE} aria-label={t('modalTitle')}>
              <ModalHeader>
                <ModalHeading>{t('modalTitle')}</ModalHeading>
              </ModalHeader>
              <ModalBody className="px-0 pb-0">
                <div className="px-4">
                  <TextField value={search} onChange={setSearch} className="w-full" aria-label={t('searchPlaceholder')}>
                    <InputGroup>
                      <InputGroup.Prefix>
                        <SearchIcon className="size-4 text-muted" />
                      </InputGroup.Prefix>
                      <InputGroup.Input placeholder={placeholder ?? t('searchPlaceholder')} autoComplete="off" />
                      {isLoading ? (
                        <InputGroup.Suffix>
                          <Spinner size="sm" />
                        </InputGroup.Suffix>
                      ) : null}
                    </InputGroup>
                  </TextField>
                </div>

                <div
                  ref={listRef}
                  className="mt-2"
                  style={{ maxHeight: '60vh', overflowY: 'auto' }}
                  data-cy="user-picker-list"
                >
                  {groups.length === 0 && !isLoading ? (
                    <div className="py-10 text-center text-sm text-muted">{t('empty')}</div>
                  ) : (
                    <ListBox aria-label={t('modalTitle')} selectionMode="none">
                      {groups.map((group) => (
                        <ListBoxSection key={group.letter} id={group.letter}>
                          <Header className="sticky top-0 z-10 bg-surface-secondary px-2 py-1 text-xs font-semibold text-muted">
                            {group.letter}
                          </Header>
                          {group.users.map((user) => (
                            <ListBoxItem
                              key={user.id}
                              id={String(user.id)}
                              textValue={user.username}
                              onAction={() => handleSelect(user)}
                              data-cy={`user-picker-item-${user.id}`}
                            >
                              <AttraccessUser user={user} interactive={false} />
                            </ListBoxItem>
                          ))}
                        </ListBoxSection>
                      ))}
                    </ListBox>
                  )}
                  <div ref={sentinelRef} />
                  {isFetchingNextPage ? (
                    <div className="flex justify-center py-3">
                      <Spinner size="sm" />
                    </div>
                  ) : null}
                </div>
              </ModalBody>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </div>
  );
}
