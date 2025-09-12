import { HTMLAttributes, useEffect, useMemo, useState } from 'react';
import { Autocomplete, AutocompleteItem, AutocompleteProps } from '@heroui/autocomplete';
import { useTranslations } from '../../i18n';
import { AttraccessUser } from '../attraccess-user/AttraccessUser';
import { User, useUsersServiceFindMany, useUsersServiceGetOneUserById } from '@attraccess/react-query-client';

import * as en from './en.json';
import * as de from './de.json';

interface UserSearchProps {
  label?: string;
  placeholder?: string;
  onSelectionChange?: (user: User | null) => void;
  autocompleteProps?: { size?: AutocompleteProps['size'] };
  wrapperProps?: Omit<HTMLAttributes<HTMLDivElement>, 'children'>;
  afterAutocomplete?: React.ReactNode;
  afterSelection?: React.ReactNode;
}

export function UserSearch(props: Readonly<UserSearchProps>) {
  const { label, placeholder, onSelectionChange, autocompleteProps, afterAutocomplete, wrapperProps, afterSelection } =
    props;

  const { t } = useTranslations('userSearch', {
    en,
    de,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedUserId = useMemo(() => (selectedKey ? Number(selectedKey) : null), [selectedKey]);

  const searchUsers = useUsersServiceFindMany({ search: searchTerm, limit: 10, page: 1 });

  const users = useMemo(() => {
    return searchUsers.data?.data ?? [];
  }, [searchUsers.data]);

  const selectedUserDetails = useUsersServiceGetOneUserById({ id: selectedUserId as number }, undefined, {
    enabled: !!selectedUserId,
  });

  const selectedUser = useMemo(() => {
    if (!selectedUserId) {
      return null;
    }

    if (selectedUserDetails.data?.id === selectedUserId) {
      return selectedUserDetails.data;
    }

    const userFromSearch = users.find((user) => user.id === selectedUserId);
    if (userFromSearch) {
      return userFromSearch;
    }

    return null;
  }, [selectedUserId, selectedUserDetails.data, users]);

  useEffect(() => {
    if (typeof onSelectionChange !== 'function') {
      return;
    }

    const selectedUser = users.find((user) => user.id === selectedUserId);

    onSelectionChange(selectedUser ?? null);
  }, [selectedUserId, onSelectionChange, users]);

  return (
    <div {...wrapperProps}>
      <div className="flex gap-2 items-center">
        <Autocomplete
          inputValue={searchTerm}
          isLoading={searchUsers.isLoading}
          items={users}
          label={label ?? t('label')}
          placeholder={placeholder ?? t('placeholder')}
          onInputChange={setSearchTerm}
          selectedKey={selectedKey}
          onSelectionChange={(key) => setSelectedKey(key as string | null)}
          isClearable
          inputProps={{ autoComplete: 'off', type: 'search' }}
          onClear={() => {
            setSelectedKey(null);
            setSearchTerm('');
          }}
          size={autocompleteProps?.size}
        >
          {(item) => (
            <AutocompleteItem key={(item as User).id}>
              <AttraccessUser user={item as User} />
            </AutocompleteItem>
          )}
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
