import { UserSearchTrigger } from './UserSearchTrigger';
// Address-book style user picker: a "Choose user" button that opens a searchable,
// alphabetically grouped, infinitely scrolling modal of all users.
// FEATURE: User selection via a phone-address-book modal
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
import { SearchIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslations } from '../../i18n';
import { AttraccessUser } from '../attraccess-user/AttraccessUser';

import de from './de.json';
import en from './en.json';

import type { UserSearchProps } from './UserSearch.types';
import { useUserSearch } from './useUserSearch';

// Mirrors the app's StandardModal chrome (bg-surface-secondary + field-contrast
// vars) so fields inside this modal match every other modal in the app. The lib
// cannot import the app-level StandardModal (apps depend on libs, not vice versa).
const FIELD_CONTRAST_STYLE: React.CSSProperties = {
  ['--field-border' as never]: 'var(--border-secondary)',
  ['--border-width-field' as never]: '1px',
};

export function UserSearch(props: Readonly<UserSearchProps>) {
  const { label, placeholder, size, resetSignal, onSelectionChange, afterAutocomplete, wrapperProps, afterSelection } =
    props;

  const { t } = useTranslations({ en, de });

  // Associate the standalone field label with the trigger button so screen
  // readers announce e.g. "User, Choose user, button" instead of the bare button text.
  const labelId = useId();
  const triggerId = useId();

  const { isOpen, open, close } = useOverlayState();
  const {
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
  } = useUserSearch({ isOpen, open, close, resetSignal, onSelectionChange });

  return (
    <div {...wrapperProps}>
      <Label id={labelId} className="mb-1 block">
        {label ?? t('label')}
      </Label>

      <UserSearchTrigger
        selectedUser={selectedUser}
        size={size}
        open={open}
        setSelectedUser={setSelectedUser}
        labelId={labelId}
        triggerId={triggerId}
        t={t}
        afterAutocomplete={afterAutocomplete}
        afterSelection={afterSelection}
      />

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

                <div aria-live="polite" className="sr-only">
                  {t('resultCount', { count: users.length })}
                </div>

                <div
                  ref={listRef}
                  className="mt-2"
                  style={{ maxHeight: '60vh', overflowY: 'auto' }}
                  data-cy="user-picker-list"
                >
                  {isError && users.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-10" data-cy="user-picker-error">
                      <p className="text-sm text-muted">{t('loadError')}</p>
                      <Button variant="secondary" size="sm" isPending={isFetching} onPress={() => refetch()}>
                        {t('retry')}
                      </Button>
                    </div>
                  ) : groups.length === 0 && !isLoading ? (
                    <div className="py-10 text-center text-sm text-muted">{t('empty')}</div>
                  ) : (
                    <ListBox aria-label={t('usersListLabel')} selectionMode="none">
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
                  {isError ? null : <div ref={sentinelRef} />}
                  {isError && users.length > 0 ? (
                    // A later page failed: keep the loaded results and offer an inline
                    // retry instead of discarding the list for the full error screen.
                    <div className="flex items-center justify-center gap-3 py-3" data-cy="user-picker-load-more-error">
                      <p className="text-sm text-muted">{t('loadError')}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        isPending={isFetchingNextPage}
                        onPress={() => fetchNextPage()}
                      >
                        {t('retry')}
                      </Button>
                    </div>
                  ) : null}
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
