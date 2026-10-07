import {
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
import { Copy, KeyRound, Trash2, X } from 'lucide-react';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/emptyState';
import { PermissionPicker } from '../../../components/permissionPicker';
import { SimplePagination } from '../../../components/simplePagination';
import { PAGE_SIZE } from './index.page-size';
import { useApiTokensCardState } from './useApiTokensCardState';

export function ApiTokensCard({ availablePermissions }: { availablePermissions: string[] }) {
  const {
    t,
    permissionLabel,
    permissionDescription,
    permissionCategory,
    page,
    setPage,
    name,
    setName,
    permissionKeys,
    setPermissionKeys,
    expiresAt,
    setExpiresAt,
    secret,
    setSecret,
    tokenPage,
    isLoadingTokens,
    isCreating,
    isRevoking,
    availablePermissionDetails,
    createToken,
    revokeToken,
    copySecret,
  } = useApiTokensCardState({ availablePermissions });

  if (isLoadingTokens) return <Skeleton className="w-full h-10" />;
  const apiTokens = tokenPage?.data ?? [];

  return (
    <div className="flex flex-col gap-4" data-cy="api-tokens-card">
      <div>
        <div className="text-sm font-medium">{t('title')}</div>
        <div className="text-sm text-default-500">{t('description')}</div>
      </div>

      {secret && (
        <div className="flex flex-col gap-2 rounded-medium border border-warning p-3" data-cy="api-token-secret">
          <div className="text-sm font-medium">{t('secret.title')}</div>
          <div className="text-sm text-default-500">{t('secret.description')}</div>
          <div className="flex gap-2">
            <Input value={secret} readOnly aria-label={t('secret.title')} />
            <Button variant="ghost" isIconOnly aria-label={t('actions.copy')} onPress={copySecret}>
              <Copy size={16} />
            </Button>
            <Button variant="ghost" isIconOnly aria-label={t('actions.dismiss')} onPress={() => setSecret(null)}>
              <X size={16} />
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableScrollContainer>
          <TableContent aria-label={t('title')}>
            <TableHeader>
              <TableColumn id="name" isRowHeader>
                {t('columns.name')}
              </TableColumn>
              <TableColumn id="permissions">{t('columns.permissions')}</TableColumn>
              <TableColumn id="lastUsed">{t('columns.lastUsed')}</TableColumn>
              <TableColumn id="expires">{t('columns.expires')}</TableColumn>
              <TableColumn id="actions">
                <span className="sr-only">{t('columns.actions')}</span>
              </TableColumn>
            </TableHeader>
            <TableBody items={apiTokens} renderEmptyState={() => <EmptyState message={t('empty')} />}>
              {(apiToken) => (
                <TableRow key={apiToken.id} id={apiToken.id}>
                  <TableCell>{apiToken.name}</TableCell>
                  <TableCell>{apiToken.permissionKeys.join(', ')}</TableCell>
                  <TableCell>
                    {apiToken.lastUsedAt ? <DateTimeDisplay date={apiToken.lastUsedAt} /> : t('neverUsed')}
                  </TableCell>
                  <TableCell>
                    {apiToken.expiresAt ? <DateTimeDisplay date={apiToken.expiresAt} /> : t('neverExpires')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      isIconOnly
                      aria-label={t('actions.revoke', { name: apiToken.name })}
                      onPress={() => revokeToken(apiToken)}
                      isDisabled={isRevoking}
                    >
                      <Trash2 size={16} className="text-danger" />
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
      <SimplePagination
        page={page}
        total={Math.max(1, Math.ceil((tokenPage?.total ?? 0) / PAGE_SIZE))}
        onChange={setPage}
        showControls
        aria-label={t('title')}
      />

      <TextField value={name} onChange={setName} isDisabled={isCreating}>
        <Label>{t('nameLabel')}</Label>
        <Input placeholder={t('namePlaceholder')} />
      </TextField>
      <div>
        <Label>{t('permissionsLabel')}</Label>
        <PermissionPicker
          permissions={availablePermissionDetails}
          selectedKeys={permissionKeys}
          onChange={(keys) => setPermissionKeys(new Set([...keys].map(String)))}
          label={t('permissionsLabel')}
          placeholder={t('permissionsPlaceholder')}
          searchPlaceholder={t('permissionsSearchPlaceholder')}
          emptyMessage={t('permissionsEmpty')}
          permissionLabel={permissionLabel}
          permissionDescription={permissionDescription}
          permissionCategory={permissionCategory}
          dataCy="api-token-permission-picker"
          isDisabled={isCreating}
          presentation="drawer"
          drawerTitle={t('picker.title')}
          drawerDescription={t('picker.description')}
          drawerApplyLabel={t('picker.apply')}
          drawerCancelLabel={t('picker.cancel')}
          drawerSelectedCount={(selected, total) => t('picker.selectedCount', { selected, total })}
          drawerPreviewLabel={t('picker.previewLabel')}
          drawerEmptyPreview={t('picker.emptyPreview')}
          drawerEditLabel={t('picker.edit')}
          drawerSelectCategoryLabel={t('picker.selectCategory')}
          drawerClearCategoryLabel={t('picker.clearCategory')}
        />
      </div>
      <TextField value={expiresAt} onChange={setExpiresAt} isDisabled={isCreating}>
        <Label>{t('expiryLabel')}</Label>
        <Input type="date" />
      </TextField>
      <Button
        onPress={createToken}
        isPending={isCreating}
        isDisabled={!name.trim() || permissionKeys.size === 0 || isCreating}
        data-cy="api-token-create-button"
      >
        <KeyRound size={16} />
        {t('actions.create')}
      </Button>
    </div>
  );
}
