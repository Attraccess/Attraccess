import { Card, CardBody, CardHeader, Chip } from '@heroui/react';
import { BotIcon, CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { AiSettingsForm } from '../../forms/AiSettingsForm';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export function AiSettingsCard() {
  const { t } = useTranslations({ en, de });
  const { data: settings } = useSettingsServiceGetSystemSettings();

  const statusChip = settings ? (
    <Chip color={settings.ai.enabled ? 'success' : 'default'} variant="flat">
      <div className="flex items-center gap-2">
        {settings.ai.enabled ? <CheckIcon size={16} /> : <XIcon size={16} />}
        {settings.ai.enabled ? t('status.enabled') : t('status.disabled')}
      </div>
    </Chip>
  ) : null;

  return (
    <Card className="flex-1 min-w-[300px]">
      <CardHeader>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<BotIcon size={18} />}
          noMargin
          actions={statusChip}
        />
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <AiSettingsForm />
      </CardBody>
    </Card>
  );
}
