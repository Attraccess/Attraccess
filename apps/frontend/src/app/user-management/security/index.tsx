import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ShieldIcon, KeyRoundIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { AuthRateLimitCard } from '../../settings/cards/AuthRateLimitCard';
import { PasswordPolicyCard } from '../../settings/cards/PasswordPolicyCard';
import { Button } from '../../../components/button';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export function UserSecurityPage() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { data: license } = useLicenseServiceGetLicenseInformation();

  const hasSso = license?.modules.includes('sso');

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<ShieldIcon size={20} />}
        backTo="/users"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <AuthRateLimitCard />
        <PasswordPolicyCard />

        {hasSso && (
          <section
            className={cn(
              'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
            )}
            data-cy="sso-settings-section"
          >
            <div className="flex items-center gap-2">
              <KeyRoundIcon size={18} className="text-default-700" />
              <div className="flex flex-col">
                <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sso.title')}</h3>
                <p className="text-xs text-default-500">{t('sso.subtitle')}</p>
              </div>
            </div>
            <div>
              <Button variant="primary" onPress={() => navigate('/sso/providers')}>
                {t('sso.openButton')}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default UserSecurityPage;
