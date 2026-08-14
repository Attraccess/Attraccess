import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  SSOProvider,
  useAuthenticationServiceDeleteOneSsoProvider,
  useAuthenticationServiceGetAllSsoProviders,
  useAuthenticationServiceGetAllSsoProvidersKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { SSOProvidersTable } from './SSOProvidersTable';
import { useToastMessage } from '../../../components/toastProvider';
import { useSsoProvidersBasePath } from '../../../hooks/useSsoProvidersBasePath';
import en from './en.json';
import de from './de.json';

export const SSOProvidersList = () => {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { form: providerFormPath } = useSsoProvidersBasePath();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastMessage();
  const { data: providers, error } = useAuthenticationServiceGetAllSsoProviders();

  const deleteSSOProvider = useAuthenticationServiceDeleteOneSsoProvider({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [useAuthenticationServiceGetAllSsoProvidersKey],
      });
    },
  });

  const handleEdit = useCallback(
    (provider: SSOProvider) => {
      navigate(`${providerFormPath}/${provider.id}`);
    },
    [navigate, providerFormPath],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm(t('deleteConfirmation'))) {
        return;
      }
      try {
        await deleteSSOProvider.mutateAsync({ id });
        success({
          title: t('providerDeleted'),
          description: t('providerDeletedDesc'),
        });
      } catch (err) {
        showError({
          title: t('errorGeneric'),
          description: err instanceof Error ? err.message : t('failedToDelete'),
        });
      }
    },
    [deleteSSOProvider, showError, success, t],
  );

  if (error) {
    return <div className="text-red-500 p-4">{t('errorLoading')}</div>;
  }

  return <SSOProvidersTable providers={providers ?? []} onEdit={handleEdit} onDelete={handleDelete} />;
};
