import React, { useMemo, useState } from 'react';
import { PageHeader } from '../../components/pageHeader';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import {
  Users,
  ShieldOffIcon,
  ShieldCheckIcon,
  Settings2Icon,
  UserPlusIcon,
  WrenchIcon,
  CreditCardIcon,
  MoreVerticalIcon,
  KeyIcon,
} from 'lucide-react';
import { useLicenseServiceGetLicenseInformation, useUsersServiceFindMany } from '@attraccess/react-query-client';
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

  const { data: license } = useLicenseServiceGetLicenseInformation();

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
            <InviteUserModal>
              {(onOpen) => (
                <Button variant="light" onPress={onOpen} startContent={<UserPlusIcon className="w-4 h-4" />} size="md">
                  {t('actions.inviteUser')}
                </Button>
              )}
            </InviteUserModal>
            <AllowedSignupDomainsEditorModal>
              {(onOpen) => (
                <Dropdown>
                  <DropdownTrigger>
                    <Button variant="light" endContent={<MoreVerticalIcon className="w-4 h-4" />}>
                      {t('actions.menu')}
                    </Button>
                  </DropdownTrigger>

                  <DropdownMenu>
                    <DropdownItem
                      key="editAllowedSignupDomains"
                      onPress={onOpen}
                      startContent={<Settings2Icon className="w-4 h-4" />}
                    >
                      {t('actions.editAllowedSignupDomains')}
                    </DropdownItem>

                    {license?.modules.includes('sso') ? (
                      <DropdownItem
                        key="sso"
                        onPress={() => navigate('/sso/providers')}
                        startContent={<KeyIcon className="w-4 h-4" />}
                      >
                        {t('actions.sso')}
                      </DropdownItem>
                    ) : null}
                  </DropdownMenu>
                </Dropdown>
              )}
            </AllowedSignupDomainsEditorModal>
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
              <TableColumn width="0" className="hidden md:table-cell">
                {t('table.columns.isEmailVerified')}
              </TableColumn>
              <TableColumn width="0">{t('table.columns.id')}</TableColumn>
              <TableColumn>{t('table.columns.username')}</TableColumn>
              <TableColumn className="hidden md:table-cell">{t('table.columns.externalIdentifier')}</TableColumn>
              <TableColumn className="text-center">{t('table.columns.permissions')}</TableColumn>
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
                  <TableCell>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {[
                        {
                          key: 'canManageResources',
                          enabled: user.systemPermissions?.canManageResources,
                          label: t('table.columns.canManageResources'),
                          icon: <WrenchIcon className="w-3.5 h-3.5" />,
                        },
                        {
                          key: 'canManageSystemConfiguration',
                          enabled: user.systemPermissions?.canManageSystemConfiguration,
                          label: t('table.columns.canManageSystemConfiguration'),
                          icon: <Settings2Icon className="w-3.5 h-3.5" />,
                        },
                        {
                          key: 'canManageUsers',
                          enabled: user.systemPermissions?.canManageUsers,
                          label: t('table.columns.canManageUsers'),
                          icon: <Users className="w-3.5 h-3.5" />,
                        },
                        {
                          key: 'canManageBilling',
                          enabled: user.systemPermissions?.canManageBilling,
                          label: t('table.columns.canManageBilling'),
                          icon: <CreditCardIcon className="w-3.5 h-3.5" />,
                        },
                      ]
                        .filter((permission) => permission.enabled)
                        .map((permission) => (
                          <Tooltip key={permission.key} content={permission.label} showArrow placement="top">
                            <Chip
                              size="sm"
                              variant="flat"
                              color="primary"
                              className="min-w-0 px-2"
                              data-cy={`user-permission-chip-${permission.key}`}
                            >
                              {permission.icon}
                            </Chip>
                          </Tooltip>
                        ))}
                      {![
                        user.systemPermissions?.canManageResources,
                        user.systemPermissions?.canManageSystemConfiguration,
                        user.systemPermissions?.canManageUsers,
                        user.systemPermissions?.canManageBilling,
                      ].some(Boolean) && <span className="text-default-400 text-sm">{t('table.noPermissions')}</span>}
                    </div>
                  </TableCell>
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
