import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Settings2Icon } from 'lucide-react';
import { PageHeader } from '../../components/pageHeader';
import en from './en.json';
import de from './de.json';
import { AppSettingsCard } from './cards/AppSettingsCard';
import { SmtpSettingsCard } from './cards/SmtpSettingsCard';
import { MetricsSettingsCard } from './cards/MetricsSettingsCard';
import { AuthRateLimitCard } from './cards/AuthRateLimitCard';
import { MessagingRateLimitCard } from './cards/MessagingRateLimitCard';
import { PasswordPolicyCard } from './cards/PasswordPolicyCard';
import { PushSettingsCard } from './cards/PushSettingsCard';

export function SystemSettingsPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<Settings2Icon size={20} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <AppSettingsCard variant="standalone" />
        <SmtpSettingsCard variant="standalone" />
        <MetricsSettingsCard />
        <AuthRateLimitCard />
        <MessagingRateLimitCard />
        <PasswordPolicyCard />
        <PushSettingsCard />
      </div>
    </div>
  );
}

export default SystemSettingsPage;
