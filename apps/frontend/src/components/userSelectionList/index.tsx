import { AttraccessUser, UserSearch, useTranslations } from '@attraccess/plugins-frontend-ui';
import { User } from '@attraccess/react-query-client';
import {
  Button,
  ButtonProps,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableProps,
  TableRow,
} from '@heroui/react';

import de from './de.json';
import en from './en.json';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { EmptyState } from '../EmptyState';

export interface Action<TUser> extends Omit<ButtonProps, 'onClick' | 'children' | 'key'> {
  key: string;
  label?: string;
  onClick: (user: TUser) => void;
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
  onAddToSelection: (user: User) => void;
  addToSelectionIsLoading?: boolean;
  actions?: Action<TUser>[] | ((user: TUser) => Action<TUser>[]);
  tableProps?: Omit<TableProps, 'bottomContent' | 'children'>;
  additionalColumns?: Column<TUser>[];
  rowClassName?: string | ((user: TUser) => string | undefined);
}

export function UserSelectionList<TUser extends User = User>(props: Readonly<Props<TUser>>) {
  const {
    selectedUsers,
    selectedUserIsLoading,
    onAddToSelection,
    addToSelectionIsLoading,
    actions,
    tableProps,
    additionalColumns,
    rowClassName,
  } = props;

  const { t } = useTranslations('userSelectionList', {
    de,
    en,
  });

  const [userSearchSelection, setUserSearchSelection] = useState<User | null>(null);

  const onAddUser = useCallback(() => {
    if (userSearchSelection) {
      onAddToSelection(userSearchSelection);
    }
  }, [userSearchSelection, onAddToSelection]);

  const parseActions = (user: TUser) => {
    if (!actions) {
      return [];
    }

    if (typeof actions === 'function') {
      return actions(user);
    }

    return actions;
  };

  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => {
    return Math.ceil((selectedUsers?.length ?? 0) / 10);
  }, [selectedUsers]);

  const currentPage = useMemo(() => {
    if (!selectedUsers) {
      return [];
    }

    return selectedUsers.slice((page - 1) * 10, page * 10);
  }, [selectedUsers, page]);

  return (
    <div className="flex flex-col gap-2">
      <UserSearch
        wrapperProps={{ className: 'w-full' }}
        onSelectionChange={setUserSearchSelection}
        autocompleteProps={{ size: 'sm' }}
        afterSelection={
          userSearchSelection && (
            <Button
              onPress={onAddUser}
              color="primary"
              isLoading={addToSelectionIsLoading}
              isIconOnly
              endContent={<PlusIcon className="w-4 h-4" />}
            />
          )
        }
      />

      <Table
        {...tableProps}
        bottomContent={
          <div className="flex w-full justify-center">
            <Pagination isCompact showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
          </div>
        }
      >
        <TableHeader>
          <TableColumn>{t('selectedUsers.columns.user')}</TableColumn>
          {
            (additionalColumns ?? []).map((col) => (
              <TableColumn className={col.headerClassName} key={col.key}>
                {col.label}
              </TableColumn>
            )) as any
          }
          <TableColumn>{t('selectedUsers.columns.actions')}</TableColumn>
        </TableHeader>
        <TableBody items={currentPage} isLoading={selectedUserIsLoading} emptyContent={<EmptyState />}>
          {(user) => (
            <TableRow key={user.id} className={typeof rowClassName === 'function' ? rowClassName(user) : rowClassName}>
              <TableCell className="w-full">
                <AttraccessUser user={user} />
              </TableCell>

              {
                (additionalColumns ?? []).map((col) => (
                  <TableCell className={col.cellClassName} key={col.key}>
                    {typeof col.value === 'function' ? col.value(user) : col.value}
                  </TableCell>
                )) as any
              }

              <TableCell>
                <div className="flex gap-4 flex-row flex-wrap md:flex-nowrap">
                  {parseActions(user).map((action) => (
                    <Button
                      {...{ ...action, label: undefined, onClick: undefined }}
                      key={action.key}
                      onPress={() => action.onClick(user)}
                      className="flex"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
