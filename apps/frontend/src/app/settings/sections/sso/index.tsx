import { Navigate, useNavigate } from 'react-router-dom';
import { PlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { Button } from '../../../../components/button';
import { SSOProvidersList } from '../../../sso/providers/SSOProvidersList';
import { useAuth } from '../../../../hooks/useAuth';
import en from './en.json';
import de from './de.json';

/**
 * Single sign-on, moved here from `/sso/providers`. The provider list and its per-provider form are
 * unchanged — each provider is its own resource with its own editor, so this section has no fields
 * of its own and therefore no save bar.
 */
export function SsoSection() {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { data: license } = useLicenseServiceGetLicenseInformation();

  // Belt and braces with the route guard: the rail hides the section, but a typed URL should not
  // reach the list either.
  if (!hasPermission('system.sso.manage')) {
    return <Navigate to="/" replace />;
  }

  if (license && !license.modules.includes('sso')) {
    return (
      <SettingsSection title={t('title')} description={t('description')}>
        <p className="text-sm text-muted">{t('notLicensed')}</p>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="flex flex-col gap-4">
        <div className="flex">
          <Button
            variant="primary"
            size="sm"
            onPress={() => navigate('/sso/providers/new')}
            data-cy="sso-providers-page-header-add-new-provider-button"
          >
            <PlusIcon size={16} />
            {t('actions.addNew')}
          </Button>
        </div>

        <SSOProvidersList />
      </div>
    </SettingsSection>
  );
}

export default SsoSection;
