import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../components/pageHeader';
import { SSOProvidersList } from './providers/SSOProvidersList';
import { useAuth } from '../../hooks/useAuth';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export const SSOProvidersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManageSSO = hasPermission('system.settings.manage');
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { data: license } = useLicenseServiceGetLicenseInformation();

  // Redirect if user doesn't have permission
  if (!canManageSSO) {
    return <Navigate to="/" />;
  }

  if (license && !license.modules.includes('sso')) {
    return null;
  }

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
            onPress: () => navigate('/sso/providers/new'),
            dataCy: 'sso-providers-page-header-add-new-provider-button',
          },
        ]}
      />

      <div className="mt-6">
        <SSOProvidersList />
      </div>
    </div>
  );
};
