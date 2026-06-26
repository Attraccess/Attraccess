import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MessageSquareIcon } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader';
import { MessagingRateLimitCard } from '../../settings/cards/MessagingRateLimitCard';
import { PushSettingsCard } from '../../settings/cards/PushSettingsCard';
import en from './en.json';
import de from './de.json';

export function MessagingSettingsPage() {
  const { t } = useTranslations({ en, de });

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<MessageSquareIcon size={20} />}
        backTo="/messages"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <MessagingRateLimitCard />
        <PushSettingsCard />
      </div>
    </div>
  );
}

export default MessagingSettingsPage;
