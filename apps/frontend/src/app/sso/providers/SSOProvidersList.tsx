import React, { forwardRef, useImperativeHandle } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAuthenticationServiceGetAllSsoProviders } from '@attraccess/react-query-client';
import { SSOProvidersTable } from './SSOProvidersTable';
import { SSOProviderFormDrawer } from './SSOProviderFormDrawer';
import { useSSOProviderForm } from './useSSOProviderForm';
import { useSSOProviderSetupUrls } from './useSSOProviderSetupUrls';
import en from './en.json';
import de from './de.json';

export interface SSOProvidersListRef {
  handleAddNew: () => void;
}

export const SSOProvidersList = forwardRef<SSOProvidersListRef, React.ComponentPropsWithoutRef<'div'>>((_props, ref) => {
  const { t } = useTranslations({ en, de });
  const { data: providers, error } = useAuthenticationServiceGetAllSsoProviders();

  const form = useSSOProviderForm();
  const setupUrls = useSSOProviderSetupUrls(form.providerDetails?.id);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    handleAddNew: form.handleAddNew,
  }));

  if (error) {
    return <div className="text-red-500 p-4">{t('errorLoading')}</div>;
  }

  return (
    <>
      <SSOProvidersTable providers={providers ?? []} onEdit={form.handleEdit} onDelete={form.handleDelete} />
      <SSOProviderFormDrawer form={form} setupUrls={setupUrls} />
    </>
  );
});
