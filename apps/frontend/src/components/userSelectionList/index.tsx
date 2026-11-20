import {
  AttraccessUser,
  Button,
  EmptyState,
  TableActionsColumnHeader,
  TableRowAction,
  TableRowActions,
  UserIdentity,
  UserSearch,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { User } from '@attraccess/react-query-client';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableProps,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { SimplePagination } from '../simplePagination';
import { PlusIcon } from 'lucide-react';

import de from './de.json';
import en from './en.json';

/** A row action of the shared TableRowActions menu, called with the row's user. */
export interface Action<TUser> extends Omit<TableRowAction, 'onPress' | 'href'> {
  onPress: (user: TUser) => unknown;
}

export interface Column<TUser> {
  key: string;
  label: string;
  value: ReactNode | ((user: TUser) => ReactNode);
  headerClassName?: string;
  cellClassName?: string;
}

interface Props<TUser> {
  selectedUsers?: TUser[];
  selectedUserIsLoading?: boolean;
  onAddToSelection: (user: UserIdentity) => void;
  addToSelectionIsLoading?: boolean;
  actions?: Action<TUser>[] | ((user: TUser) => Action<TUser>[]);
  tableProps?: Omit<TableProps, 'children'>;
  additionalColumns?: Column<TUser>[];
  rowClassName?: string | ((user: TUser) => string | undefined);
}

export function UserSelectionList<TUser extends User = User>(props: Readonly<Props<TUser>>) {
  const {
    selectedUsers,
    onAddToSelection,
    addToSelectionIsLoading,
    actions,
    tableProps,
    additionalColumns,
    rowClassName,
  } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const [userSearchSelection, setUserSearchSelection] = useState<UserIdentity | null>(null);
  const [pickerResetSignal, setPickerResetSignal] = useState(0);

  const onAddUser = useCallback(() => {
    if (userSearchSelection) {
      onAddToSelection(userSearchSelection);
      // Clear the picker after adding so a repeat click cannot silently re-add
      // the same user; matches the reset behavior of the drawer consumers.
      setUserSearchSelection(null);
      setPickerResetSignal((signal) => signal + 1);
    }
  }, [userSearchSelection, onAddToSelection]);

  const rowActions = (user: TUser): TableRowAction[] => {
    const userActions = typeof actions === 'function' ? actions(user) : (actions ?? []);
    return userActions.map((action) => ({ ...action, onPress: () => action.onPress(user) }));
  };

  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => {
    return Math.ceil((selectedUsers?.length ?? 0) / 10);
  }, [selectedUsers]);

  const normalizedUsers = useMemo(() => {
    return (selectedUsers ?? []).filter((user): user is TUser => !!user && typeof user.id === 'number');
  }, [selectedUsers]);

  const sortedUsers = useMemo(() => {
    return [...normalizedUsers].sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''));
  }, [normalizedUsers]);

  const currentPage = useMemo(() => {
    return sortedUsers.slice((page - 1) * 10, page * 10);
  }, [sortedUsers, page]);

  return (
    <div className="flex flex-col gap-2">
      <UserSearch
        wrapperProps={{ className: 'w-full' }}
        size="sm"
        resetSignal={pickerResetSignal}
        onSelectionChange={setUserSearchSelection}
        afterSelection={
          userSearchSelection && (
            <Button variant="primary" onPress={onAddUser} isPending={addToSelectionIsLoading} isIconOnly>
              <PlusIcon className="w-4 h-4" />
            </Button>
          )
        }
      />

      <Table {...tableProps}>
        <TableScrollContainer>
          <TableContent aria-label={t('table.ariaLabel')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('selectedUsers.columns.user')}</TableColumn>
              {
                (additionalColumns ?? []).map((col) => (
                  <TableColumn className={col.headerClassName} key={col.key} id={col.key}>
                    {col.label}
                  </TableColumn>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                )) as any
              }
              <TableColumn>
                <TableActionsColumnHeader />
              </TableColumn>
            </TableHeader>
            <TableBody items={currentPage} renderEmptyState={() => <EmptyState />}>
              {(user) => (
                <TableRow
                  key={user.id}
                  id={user.id}
                  className={typeof rowClassName === 'function' ? rowClassName(user) : rowClassName}
                >
                  <TableCell className="w-full">
                    <AttraccessUser user={user} />
                  </TableCell>

                  {
                    (additionalColumns ?? []).map((col) => (
                      <TableCell className={col.cellClassName} key={col.key}>
                        {typeof col.value === 'function' ? col.value(user) : col.value}
                      </TableCell>
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    )) as any
                  }

                  <TableCell>
                    <TableRowActions itemName={user.username} actions={rowActions(user)} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      {selectedUsers && totalPages > 1 && (
        <SimplePagination
          aria-label={t('table.pagination.label')}
          showControls
          page={page}
          total={totalPages}
          onChange={setPage}
        />
      )}
    </div>
  );
}
