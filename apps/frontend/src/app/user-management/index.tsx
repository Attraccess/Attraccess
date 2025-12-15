import React, { useMemo, useState } from 'react';
import { PageHeader } from '../../components/pageHeader';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Input,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { Users, ShieldOffIcon, ShieldCheckIcon, Settings2Icon, UserPlusIcon } from 'lucide-react';
import { useUsersServiceFindMany } from '@attraccess/react-query-client';
import { EmptyState } from '../../components/emptyState';
import { TableDataLoadingIndicator } from '../../components/tableComponents';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../hooks/useReactQueryStatusToHeroUiTableLoadingState';

import en from './en.json';
import de from './de.json';
import { useDebounce } from '../../hooks/useDebounce';
import { AllowedSignupDomainsEditorModal } from './allowed-signup-domains-editor-modal';
import { InviteUserModal } from './invite-user-modal';
import { useNavigate } from 'react-router-dom';

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslations({ en, de });

  const [limit] = useState(10);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const debouncedSearch = useDebounce(search, 500);

  const navigate = useNavigate();

  const {
    data: searchResult,
    status: fetchStatus,
    isFetched: isFetchedSearchResult,
  } = useUsersServiceFindMany({ limit, page, search: debouncedSearch });

  const fetchState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  const totalPages = useMemo(() => {
    if (!searchResult?.total) {
      return 1;
    }
    return Math.ceil(searchResult.total / limit);
  }, [searchResult?.total, limit]);

  return (
    <div data-cy="user-management-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        backTo="/"
        icon={<Users className="w-6 h-6" />}
        data-cy="user-management-page-header"
        actions={
          <>
            <AllowedSignupDomainsEditorModal>
              {(onOpen) => (
                <Button variant="light" onPress={onOpen} startContent={<Settings2Icon className="w-4 h-4" />} size="md">
                  {t('actions.editAllowedSignupDomains')}
                </Button>
              )}
            </AllowedSignupDomainsEditorModal>

            <InviteUserModal>
              {(onOpen) => (
                <Button variant="light" onPress={onOpen} startContent={<UserPlusIcon className="w-4 h-4" />} size="md">
                  {t('actions.inviteUser')}
                </Button>
              )}
            </InviteUserModal>
          </>
        }
      />

      <Card>
        <CardBody>
          <Input
            label={t('table.inputs.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4"
            isClearable
            onClear={() => setSearch('')}
          />

          <Table removeWrapper aria-label={t('table.ariaLabel')} onRowAction={(key) => navigate(`/users/${key}`)}>
            <TableHeader>
              <TableColumn width="1" className="hidden md:table-cell">
                {t('table.columns.isEmailVerified')}
              </TableColumn>
              <TableColumn width="1">{t('table.columns.id')}</TableColumn>
              <TableColumn>{t('table.columns.username')}</TableColumn>
              <TableColumn className="hidden md:table-cell">{t('table.columns.externalIdentifier')}</TableColumn>
            </TableHeader>

            <TableBody
              items={searchResult?.data ?? []}
              loadingState={fetchState}
              emptyContent={<EmptyState />}
              loadingContent={<TableDataLoadingIndicator />}
            >
              {(user) => (
                <TableRow key={user.id} className="cursor-pointer hover:bg-primary-50 transition-bg duration-300">
                  <TableCell className="hidden md:table-cell">
                    {user.isEmailVerified ? <ShieldCheckIcon /> : <ShieldOffIcon />}
                  </TableCell>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>
                    <AttraccessUser user={user} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{user.externalIdentifier}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>

        <CardFooter className="flex w-full justify-end">
          {isFetchedSearchResult && (
            <Pagination isCompact showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
