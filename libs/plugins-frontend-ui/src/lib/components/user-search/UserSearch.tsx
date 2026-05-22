// User search component with server-driven ComboBox and rich user list items
// FEATURE: User search with async loading and selection display
import { HTMLAttributes, useCallback, useEffect, useMemo, useState } from 'react';
import { ComboBox, Input, Label, ListBox, ListBoxItem } from '@heroui/react';
import { useTranslations } from '../../i18n';
import { AttraccessUser } from '../attraccess-user/AttraccessUser';
import { User, useUsersServiceFindMany, useUsersServiceGetOneUserById } from '@attraccess/react-query-client';

import en from './en.json';
import de from './de.json';

type SelectionKey = string | number;

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
  const { label, placeholder, onSelectionChange, afterAutocomplete, wrapperProps, afterSelection } = props;

  const { t } = useTranslations({ en, de });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<SelectionKey | null>(null);

  const selectedUserId = useMemo(() => (selectedKey != null ? Number(selectedKey) : null), [selectedKey]);

  const searchUsers = useUsersServiceFindMany({ search: searchTerm, limit: 10, page: 1 });
  const users = useMemo(() => {
    const data = searchUsers.data?.data ?? [];
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((u) => u.username.toLowerCase().includes(needle));
  }, [searchUsers.data, searchTerm]);

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
    onSelectionChange(selectedUser);
  }, [selectedUser, onSelectionChange]);

  const handleSelectionChange = useCallback(
    (key: SelectionKey | null) => {
      setSelectedKey(key);
      if (key != null) {
        const picked = users.find((u) => u.id === Number(key));
        if (picked) setSearchTerm(picked.username);
      }
    },
    [users],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (selectedKey != null && selectedUser && value !== selectedUser.username) {
        setSelectedKey(null);
      }
    },
    [selectedKey, selectedUser],
  );

  return (
    <div {...wrapperProps}>
      <div className="flex gap-2 items-center">
        <ComboBox<User>
          className="flex-1"
          items={users}
          selectedKey={selectedKey}
          onSelectionChange={handleSelectionChange}
          inputValue={searchTerm}
          onInputChange={handleInputChange}
          menuTrigger="input"
          allowsEmptyCollection
        >
          <Label>{label ?? t('label')}</Label>
          <ComboBox.InputGroup>
            <Input placeholder={placeholder ?? t('placeholder')} autoComplete="off" />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox<User>>
              {(user) => (
                <ListBoxItem id={String(user.id)} textValue={user.username}>
                  <AttraccessUser user={user} />
                </ListBoxItem>
              )}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        {afterAutocomplete}
      </div>

      <div className="flex gap-2 items-center w-full justify-between">
        {selectedUser && <AttraccessUser user={selectedUser} className="my-2 mx-2" />}
        {afterSelection}
      </div>
    </div>
  );
}
