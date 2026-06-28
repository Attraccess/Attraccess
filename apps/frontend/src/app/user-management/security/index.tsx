import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ShieldIcon, KeyRoundIcon, ShieldCheckIcon, Settings2Icon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@heroui/react';
import { PageHeader, PageAction } from '../../../components/pageHeader';
import { AuthRateLimitCard } from '../../settings/cards/AuthRateLimitCard';
import { PasswordPolicyCard } from '../../settings/cards/PasswordPolicyCard';
import { Button } from '../../../components/button';
import { useLicenseServiceGetLicenseInformation } from '@attraccess/react-query-client';
import { TwoFactorPolicyModal } from '../two-factor-policy-modal';
import { AllowedSignupDomainsEditorModal } from '../allowed-signup-domains-editor-modal';
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
        actions={[
          {
            key: 'two-factor-policy',
            label: t('actions.twoFactorPolicy'),
            icon: <ShieldCheckIcon className="w-4 h-4" />,
            renderTrigger: (triggerProps) => (
              <TwoFactorPolicyModal>
                {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
              </TwoFactorPolicyModal>
            ),
          },
          {
            key: 'signup-domains',
            label: t('actions.editSignupDomains'),
            icon: <Settings2Icon className="w-4 h-4" />,
            renderTrigger: (triggerProps) => (
              <AllowedSignupDomainsEditorModal>
                {(onOpen) => <Button {...triggerProps} onPress={onOpen} />}
              </AllowedSignupDomainsEditorModal>
            ),
          },
        ] satisfies PageAction[]}
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
