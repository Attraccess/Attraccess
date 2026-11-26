import { useEffect } from 'react';
import {
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { Trash2 } from 'lucide-react';
import {
  DateTimeDisplay,
  EmptyState,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { useListMcpOAuthGrants, useRevokeMcpOAuthGrant } from '@attraccess/react-query-client';
import type { McpOAuthGrantDto } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';

/** More than this many permissions are collapsed to "+N more" (the full list is in the tooltip). */
const MAX_LISTED_PERMISSIONS = 3;

interface McpGrantsCardProps {
  /** OAuth sign-in works on this deployment. Without it the card only shows up while old grants exist. */
  oauthEnabled: boolean;
}

/** The AI apps the user connected through OAuth, with their permissions, and a way to revoke each one. */
export function McpGrantsCard({ oauthEnabled }: McpGrantsCardProps) {
  // React escapes the output; escaping names again would show `A &amp; B` in confirmations.
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const { showToast } = useToastMessage();
  const { permissionLabel } = useRbacCatalogTranslations();
  const {
    data: grants,
    isPending,
    isError,
    refetch,
  } = useListMcpOAuthGrants<McpOAuthGrantDto[]>({}, undefined, { retry: false });
  const { mutateAsync: revokeGrant, isPending: isRevoking } = useRevokeMcpOAuthGrant();

  useEffect(() => {
    if (isError) showToast({ title: t('grants.errors.loadFailed'), type: 'error' });
  }, [isError, showToast, t]);

  const revoke = async (grant: McpOAuthGrantDto) => {
    try {
      await revokeGrant({ path: { grantId: grant.id } });
      void refetch();
      showToast({ title: t('grants.success.revoked'), type: 'success' });
    } catch (error) {
      showToast({ title: t('grants.errors.revokeFailed'), type: 'error' });
      throw error;
    }
  };

  if (isPending) return <Skeleton className="h-10 w-full" />;
  const rows = grants ?? [];
  if (!oauthEnabled && rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-4" data-cy="mcp-grants-card">
      <div>
        <div className="text-sm font-medium">{t('grants.title')}</div>
        <div className="text-sm text-default-500">{t('grants.description')}</div>
      </div>
      <Table>
        <TableScrollContainer>
          <TableContent aria-label={t('grants.title')}>
            <TableHeader>
              <TableColumn id="client" isRowHeader>
                {t('grants.columns.client')}
              </TableColumn>
              <TableColumn id="permissions">{t('grants.columns.permissions')}</TableColumn>
              <TableColumn id="approved">{t('grants.columns.approved')}</TableColumn>
              <TableColumn id="lastUsed">{t('grants.columns.lastUsed')}</TableColumn>
              <TableColumn id="expires">{t('grants.columns.expires')}</TableColumn>
              <TableColumn id="actions">
                <TableActionsColumnHeader />
              </TableColumn>
            </TableHeader>
            <TableBody items={rows} renderEmptyState={() => <EmptyState message={t('grants.empty')} />}>
              {(grant) => (
                <TableRow key={grant.id} id={grant.id}>
                  <TableCell>
                    <span className="break-words">{grant.clientName}</span>
                    {!grant.registeredByOperator && (
                      <Chip size="sm" color="warning" className="ml-2" title={t('grants.unverifiedHint')}>
                        {t('grants.unverified')}
                      </Chip>
                    )}
                  </TableCell>
                  <TableCell>
                    <span title={grant.permissionKeys.map((key) => permissionLabel({ key })).join(', ')}>
                      {grant.permissionKeys
                        .slice(0, MAX_LISTED_PERMISSIONS)
                        .map((key) => permissionLabel({ key }))
                        .join(', ')}
                      {grant.permissionKeys.length > MAX_LISTED_PERMISSIONS &&
                        ` ${t('grants.morePermissions', { count: grant.permissionKeys.length - MAX_LISTED_PERMISSIONS })}`}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DateTimeDisplay date={grant.createdAt} />
                  </TableCell>
                  <TableCell>
                    {grant.lastUsedAt ? <DateTimeDisplay date={grant.lastUsedAt} /> : t('grants.neverUsed')}
                  </TableCell>
                  <TableCell>
                    <DateTimeDisplay date={grant.expiresAt} />
                  </TableCell>
                  <TableCell>
                    <TableRowActions
                      itemName={grant.clientName}
                      actions={[
                        {
                          key: 'revoke',
                          label: t('grants.actions.revoke'),
                          icon: Trash2,
                          tone: 'danger',
                          isDisabled: isRevoking,
                          onPress: () => revoke(grant),
                          confirm: {
                            title: t('grants.revokeConfirm.title', { name: grant.clientName }),
                            message: t('grants.revokeConfirm.message'),
                          },
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </div>
  );
}
