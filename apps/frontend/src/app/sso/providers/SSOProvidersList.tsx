import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
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
  const [providerToDelete, setProviderToDelete] = useState<number | null>(null);
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

  const handleDeleteConfirmed = useCallback(async () => {
    if (providerToDelete === null) {
      return;
    }
    try {
      await deleteSSOProvider.mutateAsync({ path: { id: providerToDelete } });
      setProviderToDelete(null);
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
  }, [deleteSSOProvider, providerToDelete, showError, success, t]);

  if (error) {
    return <div className="text-red-500 p-4">{t('errorLoading')}</div>;
  }

  return (
    <>
      <SSOProvidersTable providers={providers ?? []} onEdit={handleEdit} onDelete={setProviderToDelete} />
      <StatusDialog
        isOpen={providerToDelete !== null}
        onClose={() => setProviderToDelete(null)}
        status="error"
        title={t('deleteProvider')}
        closeLabel={t('cancel')}
        action={{
          label: t('deleteText'),
          onPress: handleDeleteConfirmed,
          isPending: deleteSSOProvider.isPending,
          'data-cy': 'sso-provider-delete-confirm-button',
        }}
      >
        {t('deleteConfirmation')}
      </StatusDialog>
    </>
  );
};
