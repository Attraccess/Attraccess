import { Card } from '@heroui/react';
import { ShieldAlertIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { AuthRateLimitForm } from '../../forms/AuthRateLimitForm';
import en from './en.json';
import de from './de.json';

export function AuthRateLimitCard() {
  const { t } = useTranslations({ en, de });
  return (
    <Card className="flex-1 min-w-[300px]">
      <Card.Header>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldAlertIcon size={18} />} noMargin />
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <AuthRateLimitForm />
      </Card.Content>
    </Card>
  );
}
