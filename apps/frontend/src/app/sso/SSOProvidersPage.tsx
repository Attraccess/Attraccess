import React from 'react';
import { PageHeader } from '../../components/pageHeader';
import { SSOProvidersList, SSOProvidersListRef } from './providers/SSOProvidersList';
import { useAuth } from '../../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export const SSOProvidersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManageSSO = hasPermission('canManageSystemConfiguration');
  const { t } = useTranslations({ en, de });

  // Reference to the SSOProvidersList component
  const providerListRef = React.useRef<SSOProvidersListRef>(null);

  // Redirect if user doesn't have permission
  if (!canManageSSO) {
    return <Navigate to="/" />;
  }

  const handleAddNewProvider = () => {
    if (providerListRef.current) {
      providerListRef.current.handleAddNew();
    }
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        backTo="/users"
        actions={[
          {
            key: 'add-new',
            label: t('actions.addNew'),
            icon: <Plus size={16} />,
            variant: 'primary',
            onPress: handleAddNewProvider,
            dataCy: 'sso-providers-page-header-add-new-provider-button',
          },
        ]}
      />

      <div className="mt-6">
        <SSOProvidersList ref={providerListRef} />
      </div>
    </div>
  );
};
