import { useEffect, useMemo, useState } from 'react';
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
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/emptyState';
import { useToastMessage } from '../../../components/toastProvider';
import { PermissionPicker } from '../../../components/permissionPicker';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import {
  useApiTokensServiceCreateApiToken,
  useApiTokensServiceListApiTokens,
  useApiTokensServiceRevokeApiToken,
  useRbacServiceListPermissions,
} from '@attraccess/react-query-client';
import { SimplePagination } from '../../../components/simplePagination';
import en from './en.json';
import de from './de.json';

interface ApiToken {
  id: number;
  name: string;
  permissionKeys: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface CreatedApiToken extends ApiToken {
  token: string;
}

interface ApiTokenPage {
  data: ApiToken[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 10;

export function ApiTokensCard({ availablePermissions }: { availablePermissions: string[] }) {
  const { t } = useTranslations({ en, de });
  const { showToast } = useToastMessage();
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();
  const { data: allPermissions } = useRbacServiceListPermissions();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [permissionKeys, setPermissionKeys] = useState<Set<string>>(() => new Set());
  const [expiresAt, setExpiresAt] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const { data: tokenPage, isPending: isLoadingTokens, isError: isTokenListError, refetch: refetchTokens } =
    useApiTokensServiceListApiTokens<ApiTokenPage>({ limit: PAGE_SIZE, page });
  const { mutateAsync: createApiToken, isPending: isCreating } = useApiTokensServiceCreateApiToken<CreatedApiToken>();
  const { mutateAsync: revokeApiToken, isPending: isRevoking } = useApiTokensServiceRevokeApiToken();
  const availablePermissionDetails = useMemo(
    () => (allPermissions ?? []).filter((permission) => availablePermissions.includes(permission.key)),
    [allPermissions, availablePermissions],
  );

  useEffect(() => {
    if (isTokenListError) showToast({ title: t('errors.loadFailed'), type: 'error' });
  }, [isTokenListError, showToast, t]);

  const createToken = async () => {
    try {
      const created = await createApiToken({
        requestBody: {
          name: name.trim(),
          permissionKeys: [...permissionKeys],
          expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00`).toISOString() : undefined,
        },
      });
      setSecret(created.token);
      if (page === 1) void refetchTokens();
      else setPage(1);
      setName('');
      setPermissionKeys(new Set());
      setExpiresAt('');
      showToast({ title: t('success.created'), type: 'success' });
    } catch {
      showToast({ title: t('errors.createFailed'), type: 'error' });
    }
  };

  const revokeToken = async (token: ApiToken) => {
    try {
      await revokeApiToken({ id: token.id });
      if (tokenPage?.data.length === 1 && page > 1) setPage(page - 1);
      else void refetchTokens();
      showToast({ title: t('success.revoked'), type: 'success' });
    } catch {
      showToast({ title: t('errors.revokeFailed'), type: 'error' });
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    showToast({ title: t('success.copied'), type: 'success' });
  };

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
              <TableColumn id="name" isRowHeader>{t('columns.name')}</TableColumn>
              <TableColumn id="permissions">{t('columns.permissions')}</TableColumn>
              <TableColumn id="lastUsed">{t('columns.lastUsed')}</TableColumn>
              <TableColumn id="expires">{t('columns.expires')}</TableColumn>
              <TableColumn id="actions"><span className="sr-only">{t('columns.actions')}</span></TableColumn>
            </TableHeader>
            <TableBody items={apiTokens} renderEmptyState={() => <EmptyState message={t('empty')} />}>
              {(apiToken) => (
                <TableRow key={apiToken.id} id={apiToken.id}>
                  <TableCell>{apiToken.name}</TableCell>
                  <TableCell>{apiToken.permissionKeys.join(', ')}</TableCell>
                  <TableCell>{apiToken.lastUsedAt ? <DateTimeDisplay date={apiToken.lastUsedAt} /> : t('neverUsed')}</TableCell>
                  <TableCell>{apiToken.expiresAt ? <DateTimeDisplay date={apiToken.expiresAt} /> : t('neverExpires')}</TableCell>
                  <TableCell>
                    <Button variant="ghost" isIconOnly aria-label={t('actions.revoke', { name: apiToken.name })} onPress={() => revokeToken(apiToken)} isDisabled={isRevoking}>
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
      <Button onPress={createToken} isPending={isCreating} isDisabled={!name.trim() || permissionKeys.size === 0 || isCreating} data-cy="api-token-create-button">
        <KeyRound size={16} />
        {t('actions.create')}
      </Button>
    </div>
  );
}
