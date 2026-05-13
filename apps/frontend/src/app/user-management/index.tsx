import React, { useMemo, useState } from 'react';
import { PageHeader } from '../../components/pageHeader';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Chip,
  TextField,
  InputGroup,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { CreditCardIcon, KeyIcon, SearchIcon, Settings2Icon, ShieldCheckIcon, ShieldOffIcon, UserPlusIcon, Users, WrenchIcon } from 'lucide-react';
import { TableToolbar } from '../../components/TableToolbar';
import {
  SSOProvider,
  User,
  useAuthenticationServiceGetAllSsoProviders,
  useLicenseServiceGetLicenseInformation,
  useUsersServiceFindMany,
} from '@attraccess/react-query-client';
import { EmptyState } from '../../components/emptyState';

import en from './en.json';
import de from './de.json';
import { useDebounce } from '../../hooks/useDebounce';
import { AllowedSignupDomainsEditorModal } from './allowed-signup-domains-editor-modal';
import { TwoFactorPolicyModal } from './two-factor-policy-modal';
import { InviteUserModal } from './invite-user-modal';
import { useNavigate } from 'react-router-dom';
import { SimplePagination } from '../../components/simplePagination';

export const UserManagementPage: React.FC = () => {
  const { t } = useTranslations({ en, de });

  const [limit] = useState(10);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const debouncedSearch = useDebounce(search, 500);

  const navigate = useNavigate();

  const {
    data: searchResult,
    isFetched: isFetchedSearchResult,
  } = useUsersServiceFindMany({ limit, page, search: debouncedSearch });

  const totalPages = useMemo(() => {
    if (!searchResult?.total) {
      return 1;
    }
    return Math.ceil(searchResult.total / limit);
  }, [searchResult?.total, limit]);

  const { data: license } = useLicenseServiceGetLicenseInformation();
  const { data: ssoProviders } = useAuthenticationServiceGetAllSsoProviders(undefined, {
    enabled: license?.modules.includes('sso'),
  });

  const providersById = useMemo(
    () => new Map((ssoProviders ?? []).map((provider: SSOProvider) => [provider.id, provider])),
    [ssoProviders],
  );

  type AuthenticationDetailSummary = {
    providerId?: number | null;
    providerType?: string | null;
    ssoSubject?: string | null;
    type?: string | null;
  };

  type UserWithAuthDetails = Omit<User, 'authenticationDetails'> & {
    authenticationDetails?: AuthenticationDetailSummary[];
  };

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
                <Button variant="ghost" onPress={onOpen}>
                  <UserPlusIcon className="w-4 h-4" />
                  {t('actions.inviteUser')}
                </Button>
              )}
            </InviteUserModal>
            <TwoFactorPolicyModal>
              {(onOpenTwoFactorPolicy) => (
                <Button variant="ghost"
                  onPress={onOpenTwoFactorPolicy}

                ><ShieldCheckIcon className="w-4 h-4" />
                  {t('actions.twoFactorPolicy')}
                </Button>
              )}
            </TwoFactorPolicyModal>
            <AllowedSignupDomainsEditorModal>
              {(onOpen) => (
                <Button variant="ghost" onPress={onOpen}>
                  <Settings2Icon className="w-4 h-4" />
                  {t('actions.editAllowedSignupDomains')}
                </Button>
              )}
            </AllowedSignupDomainsEditorModal>
            {license?.modules.includes('sso') ? (
              <Button variant="ghost"
                onPress={() => navigate('/sso/providers')}

              ><KeyIcon className="w-4 h-4" />
                {t('actions.sso')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mt-6">
        <TableToolbar
          search={
            <TextField value={search} onChange={setSearch} aria-label={t('table.inputs.search')}>
              <InputGroup>
                <InputGroup.Prefix>
                  <SearchIcon size={16} />
                </InputGroup.Prefix>
                <InputGroup.Input placeholder={t('table.inputs.search')} data-cy="user-management-search-input" />
              </InputGroup>
            </TextField>
          }
        />

        <Table>
          <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn width="0" className="hidden md:table-cell">
              {t('table.columns.isEmailVerified')}
            </TableColumn>
            <TableColumn width="0">{t('table.columns.id')}</TableColumn>
            <TableColumn isRowHeader>{t('table.columns.username')}</TableColumn>
            <TableColumn className="hidden md:table-cell">{t('table.columns.externalIdentifier')}</TableColumn>
            <TableColumn width="0" className="text-center">
              {t('table.columns.ssoLinked')}
            </TableColumn>
            <TableColumn className="text-center">{t('table.columns.permissions')}</TableColumn>
          </TableHeader>

            <TableBody
              items={searchResult?.data ?? []}
              renderEmptyState={() => <EmptyState />}
            >
              {(user) => {
                const ssoDetails =
                  (user as UserWithAuthDetails).authenticationDetails?.filter(
                    (detail) => detail.ssoSubject || detail.providerId || detail.providerType,
                  ) ?? [];
                const ssoProviderNames = ssoDetails
                  .map((detail) => {
                    if (detail.providerId) {
                      const provider = providersById.get(detail.providerId);
                      if (provider?.name) {
                        return provider.name;
                      }
                    }
                    if (detail.providerType && detail.providerId) {
                      return `${detail.providerType} #${detail.providerId}`;
                    }
                    return detail.providerType ?? '';
                  })
                  .filter((value) => value.length > 0)
                  .join(', ');
                const isSsoLinked = ssoDetails.length > 0;

                return (
                  <TableRow key={user.id} id={user.id} className="cursor-pointer hover:bg-primary-50 transition-bg duration-300" onAction={() => navigate(`/users/${user.id}`)}>
                    <TableCell className="hidden md:table-cell">
                      {user.isEmailVerified ? <ShieldCheckIcon /> : <ShieldOffIcon />}
                    </TableCell>
                    <TableCell>{user.id}</TableCell>
                    <TableCell>
                      <AttraccessUser user={user} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{user.externalIdentifier}</TableCell>
                    <TableCell className="text-center">
                      {isSsoLinked ? (
                        <Tooltip>
                          <TooltipTrigger tabIndex={0}>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700">
                              <KeyIcon className="w-3.5 h-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent showArrow>{t('table.ssoLinked', { providers: ssoProviderNames || '-' })}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-default-300">-</span>
                      )}
                    </TableCell>
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
                            <Tooltip key={permission.key}>
                              <TooltipTrigger tabIndex={0}>
                                <Chip
                                  variant="soft"
                                  color="accent"
                                  className="min-w-0 px-2"
                                  data-cy={`user-permission-chip-${permission.key}`}
                                >
                                  {permission.icon}
                                </Chip>
                              </TooltipTrigger>
                              <TooltipContent showArrow>{permission.label}</TooltipContent>
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
                );
              }}
            </TableBody>
          </TableContent>
        </Table>

        <div className="flex w-full justify-end mt-4">
          {isFetchedSearchResult && (
            <SimplePagination showControls page={page} total={totalPages} onChange={(page) => setPage(page)} />
          )}
        </div>
      </div>
    </div>
  );
};
