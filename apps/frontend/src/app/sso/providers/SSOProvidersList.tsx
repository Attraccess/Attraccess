import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  SsoProvider,
  useDeleteOneSsoProvider,
  useGetAllSsoProviders,
  useGetAllSsoProvidersKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { SSOProvidersTable } from './SSOProvidersTable';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

export const SSOProvidersList = () => {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastMessage();
  const { data: providers, error } = useGetAllSsoProviders();

  const deleteSSOProvider = useDeleteOneSsoProvider(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useGetAllSsoProvidersKey],
      });
    },
  });

  const handleEdit = useCallback(
    (provider: SsoProvider) => {
      navigate(`/settings/sso/providers/${provider.id}`);
    },
    [navigate],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteSSOProvider.mutateAsync({ path: { id } });
        success({
          title: t('providerDeleted'),
          description: t('providerDeletedDesc'),
        });
      } catch (err) {
        showError({
          title: t('errorGeneric'),
          description: err instanceof Error ? err.message : t('failedToDelete'),
        });
        throw err;
      }
    },
    [deleteSSOProvider, showError, success, t],
  );

  if (error) {
    return <div className="text-red-500 p-4">{t('errorLoading')}</div>;
  }

  return <SSOProvidersTable providers={providers ?? []} onEdit={handleEdit} onDelete={handleDelete} />;
};
