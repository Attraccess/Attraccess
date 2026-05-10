// User search autocomplete component using HeroUI v3 Autocomplete compound
// FEATURE: User search with async loading and selection display
import { HTMLAttributes, useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, AutocompleteTrigger, AutocompleteValue, AutocompleteClearButton, AutocompleteIndicator, AutocompletePopover, Label, ListBoxItem } from '@heroui/react';
import { useTranslations } from '../../i18n';
import { AttraccessUser } from '../attraccess-user/AttraccessUser';
import { User, useUsersServiceFindMany, useUsersServiceGetOneUserById } from '@attraccess/react-query-client';

import en from './en.json';
import de from './de.json';

interface UserSearchProps {
  label?: string;
  placeholder?: string;
  onSelectionChange?: (user: User | null) => void;
  autocompleteProps?: { size?: 'sm' | 'md' | 'lg' };
  wrapperProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children'>;
  afterAutocomplete?: React.ReactNode;
  afterSelection?: React.ReactNode;
}

export function UserSearch(props: Readonly<UserSearchProps>) {
  const { label, placeholder, onSelectionChange, autocompleteProps, afterAutocomplete, wrapperProps, afterSelection } =
    props;

  const { t } = useTranslations({ en, de });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const handleClearSelection = useCallback(() => {
    setSelectedKey(null);
    setSearchTerm('');
  }, []);
  const selectedUserId = useMemo(() => (selectedKey ? Number(selectedKey) : null), [selectedKey]);

  const searchUsers = useUsersServiceFindMany({ search: searchTerm, limit: 10, page: 1 });
  const users = useMemo(() => searchUsers.data?.data ?? [], [searchUsers.data]);

  const selectedUserDetails = useUsersServiceGetOneUserById({ id: selectedUserId as number }, undefined, {
    enabled: !!selectedUserId,
  });

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    if (selectedUserDetails.data?.id === selectedUserId) return selectedUserDetails.data;
    return users.find((user) => user.id === selectedUserId) ?? null;
  }, [selectedUserId, selectedUserDetails.data, users]);

  useEffect(() => {
    if (typeof onSelectionChange !== 'function') return;
    onSelectionChange(users.find((user) => user.id === selectedUserId) ?? null);
  }, [selectedUserId, onSelectionChange, users]);

  return (
    <div {...wrapperProps}>
      <div className="flex gap-2 items-center">
        <Autocomplete<User>
          items={users}
          selectedKey={selectedKey}

          inputValue={searchTerm}
          onInputChange={setSearchTerm}
          size={autocompleteProps?.size}
        >
          <Label>{label ?? t('label')}</Label>
          <AutocompleteTrigger>
            <AutocompleteValue placeholder={placeholder ?? t('placeholder')} />
            <AutocompleteClearButton onClick={handleClearSelection} />
            <AutocompleteIndicator />
          </AutocompleteTrigger>
          <AutocompletePopover>
            {users.map((user) => (
              <ListBoxItem key={String(user.id)} id={String(user.id)} textValue={user.username}>
                <AttraccessUser user={user} />
              </ListBoxItem>
            ))}
          </AutocompletePopover>
        </Autocomplete>

        {afterAutocomplete}
      </div>

      <div className="flex gap-2 items-center w-full justify-between">
        {selectedUser && <AttraccessUser user={selectedUser} className="my-2 mx-2" />}
        {afterSelection}
      </div>
    </div>
  );
}
