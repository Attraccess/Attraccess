import { UserWithAuthDetails } from './user-auth-details';
import { AttraccessUser } from '@attraccess/plugins-frontend-ui';
import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@heroui/react';
import { KeyIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import { User, UserRole } from '@attraccess/react-query-client';
import { EmptyState } from '../../components/emptyState';
import { DEFAULT_ROLE_KEYS } from './index.default-role-keys';
import { useUserManagementPageState } from './useUserManagementPageState';
type Props = Pick<
  ReturnType<typeof useUserManagementPageState>,
  't' | 'searchResult' | 'roleIds' | 'roles' | 'providersById' | 'navigate' | 'assignRoleId' | 'roleName'
>;
export function UserManagementPageTable({
  t,
  searchResult,
  roleIds,
  roles,
  providersById,
  navigate,
  assignRoleId,
  roleName,
}: Props) {
  return (
    <Table>
      <TableScrollContainer>
        <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn width="0" className="hidden md:table-cell">
              {t('table.columns.isEmailVerified')}
            </TableColumn>
            <TableColumn width="0">{t('table.columns.id')}</TableColumn>
            <TableColumn isRowHeader>{t('table.columns.username')}</TableColumn>
            <TableColumn className="hidden md:table-cell">{t('table.columns.externalIdentifier')}</TableColumn>
            <TableColumn className="hidden lg:table-cell">{t('table.columns.roles')}</TableColumn>
            <TableColumn width="0" className="text-center">
              {t('table.columns.ssoLinked')}
            </TableColumn>
          </TableHeader>

          <TableBody
            items={(searchResult?.data ?? []) as User[]}
            renderEmptyState={() =>
              roleIds.length ? (
                <EmptyState
                  message={t('empty.role', {
                    role: roles?.find((role) => role.id === roleIds[0])?.name ?? roleIds[0],
                  })}
                />
              ) : (
                <EmptyState />
              )
            }
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
              // This view only receives the detailed response because it requires users.read.
              const detailedUser = user as User;

              // Elevated roles (non-default) for display
              const elevatedRoles = ((detailedUser.userRoles ?? []) as UserRole[])
                .filter((ur) => ur.role && !DEFAULT_ROLE_KEYS.has(ur.role.key))
                .reduce<{ id: number; name: string; key: string }[]>((acc, ur) => {
                  if (ur.role && !acc.some((r) => r.id === ur.role?.id)) {
                    acc.push({ id: ur.role.id, name: ur.role.name, key: ur.role.key });
                  }
                  return acc;
                }, []);

              return (
                <TableRow
                  key={user.id}
                  id={user.id}
                  className="cursor-pointer hover:bg-primary-50 transition-bg duration-300"
                  onAction={() =>
                    navigate(assignRoleId ? `/users/${user.id}?assignRoleId=${assignRoleId}` : `/users/${user.id}`)
                  }
                >
                  <TableCell className="hidden md:table-cell">
                    {detailedUser.isEmailVerified ? <ShieldCheckIcon /> : <ShieldOffIcon />}
                  </TableCell>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>
                    <AttraccessUser user={detailedUser} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{detailedUser.externalIdentifier}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {elevatedRoles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {elevatedRoles.map((role) => (
                          <Chip
                            key={role.id}
                            size="sm"
                            color="accent"
                            variant="secondary"
                            data-cy={`user-role-chip-${role.key}`}
                          >
                            {roleName(role)}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-default-400">{t('table.noRoles')}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isSsoLinked ? (
                      <Tooltip>
                        <TooltipTrigger tabIndex={0}>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700">
                            <KeyIcon className="w-3.5 h-3.5" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent showArrow>
                          {t('table.ssoLinked', { providers: ssoProviderNames || '-' })}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-default-300">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            }}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
