// User search component with debounced text input and user selection display
// FEATURE: User search with async loading and selection display
import { HTMLAttributes, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Label, TextField } from '@heroui/react';
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
  const { label, placeholder, onSelectionChange, afterAutocomplete, wrapperProps, afterSelection } = props;

  const { t } = useTranslations({ en, de });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const datalistId = useRef(`user-search-datalist-${Math.random().toString(36).slice(2)}`);

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

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      const matched = users.find((u) => u.username === value);
      if (matched) {
        setSelectedKey(String(matched.id));
      } else {
        setSelectedKey(null);
      }
    },
    [users],
  );

  return (
    <div {...wrapperProps}>
      <div className="flex gap-2 items-center">
        <TextField value={selectedUser ? selectedUser.username : searchTerm} onChange={handleInputChange} className="flex-1">
          <Label>{label ?? t('label')}</Label>
          <Input
            list={datalistId.current}
            placeholder={placeholder ?? t('placeholder')}
            onBlur={() => { if (!selectedUser && searchTerm) handleClearSelection(); }}
          />
          <datalist id={datalistId.current}>
            {users.map((user) => (
              <option key={user.id} value={user.username} />
            ))}
          </datalist>
        </TextField>
        {afterAutocomplete}
      </div>

      <div className="flex gap-2 items-center w-full justify-between">
        {selectedUser && <AttraccessUser user={selectedUser} className="my-2 mx-2" />}
        {afterSelection}
      </div>
    </div>
  );
}
