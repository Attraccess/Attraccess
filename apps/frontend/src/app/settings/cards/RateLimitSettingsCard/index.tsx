import { Card, CardBody, CardHeader } from '@heroui/react';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { RateLimitSettingsForm } from '../../forms/RateLimitSettingsForm';
import en from './en.json';
import de from './de.json';

export function RateLimitSettingsCard() {
  const { t } = useTranslations({ en, de });

  return (
    <Card className="flex-1 min-w-[300px]">
      <CardHeader>
        <PageHeader title={t('title')} subtitle={t('subtitle')} icon={<ShieldCheckIcon size={18} />} noMargin />
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <RateLimitSettingsForm />
      </CardBody>
    </Card>
  );
}
