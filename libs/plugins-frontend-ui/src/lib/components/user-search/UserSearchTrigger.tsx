import { Button } from '@heroui/react';
import { UserPlusIcon, XIcon } from 'lucide-react';
import { AttraccessUser, type UserIdentity } from '../attraccess-user/AttraccessUser';
import type { TFunction } from '../../i18n';
import type { UserSearchProps } from './UserSearch.types';

export function UserSearchTrigger({
  selectedUser,
  size,
  open,
  setSelectedUser,
  labelId,
  triggerId,
  t,
  afterAutocomplete,
  afterSelection,
}: Pick<UserSearchProps, 'size' | 'afterAutocomplete' | 'afterSelection'> & {
  selectedUser: UserIdentity | null;
  open: () => void;
  setSelectedUser: (user: UserIdentity | null) => void;
  labelId: string;
  triggerId: string;
  t: TFunction;
}) {
  return (
    <div className="flex gap-2 items-center">
      {selectedUser ? (
        <>
          <Button
            variant="ghost"
            size={size}
            onPress={open}
            className="justify-start px-2"
            id={triggerId}
            aria-labelledby={`${labelId} ${triggerId}`}
            data-cy="user-picker-selected"
          >
            <AttraccessUser user={selectedUser} interactive={false} />
          </Button>
          <Button
            variant="ghost"
            size={size ?? 'sm'}
            isIconOnly
            onPress={() => setSelectedUser(null)}
            aria-label={t('clear')}
            data-cy="user-picker-clear"
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size={size}
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
      {afterSelection}
    </div>
  );
}
