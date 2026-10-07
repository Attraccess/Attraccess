import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import {
  useApiTokensServiceCreateApiToken,
  useApiTokensServiceListApiTokens,
  useApiTokensServiceRevokeApiToken,
  useRbacServiceListPermissions,
} from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';
import { ApiToken } from './index.contracts';
import { CreatedApiToken } from './index.contracts';
import { ApiTokenPage } from './index.contracts';
import { PAGE_SIZE } from './index.page-size';
export function useApiTokensCardState({ availablePermissions }: { availablePermissions: string[] }) {
  const { t } = useTranslations({ en, de });
  const { showToast } = useToastMessage();
  const { permissionLabel, permissionDescription, permissionCategory } = useRbacCatalogTranslations();
  const { data: allPermissions } = useRbacServiceListPermissions();
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [permissionKeys, setPermissionKeys] = useState<Set<string>>(() => new Set());
  const [expiresAt, setExpiresAt] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const {
    data: tokenPage,
    isPending: isLoadingTokens,
    isError: isTokenListError,
    refetch: refetchTokens,
  } = useApiTokensServiceListApiTokens<ApiTokenPage>({ limit: PAGE_SIZE, page });
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
  return {
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
  } as const;
}
