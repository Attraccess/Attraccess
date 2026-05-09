import { Card, CardContent, CardHeader, Chip } from '@heroui/react';
import { CheckIcon, MailIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { SmtpSettingsForm } from '../../forms/SmtpSettingsForm';
import en from './en.json';
import de from './de.json';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';

export type SmtpSettingsCardVariant = 'standalone' | 'wizard';

export type SmtpSettingsCardProps = {
  variant: SmtpSettingsCardVariant;
  onNext?: () => void;
};

export function SmtpSettingsCard({ variant, onNext }: SmtpSettingsCardProps) {
  const { t } = useTranslations({ en, de });

  const { data: settings } = useSettingsServiceGetSystemSettings();

  const passwordChip =
    variant === 'standalone' && settings ? (
      <Chip color={settings.smtp.passConfigured ? 'success' : 'warning'} variant="soft">
        <div className="flex items-center gap-2">
          {settings.smtp.passConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
          {settings.smtp.passConfigured
            ? t('passwordStatus.configured')
            : t('passwordStatus.missing')}
        </div>
      </Chip>
    ) : null;

  return (
    <Card className="flex-1 min-w-[300px]">
      <CardHeader>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<MailIcon size={18} />}
          noMargin
          actions={passwordChip}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SmtpSettingsForm variant={variant} endpoint="settings" onNext={onNext} />
      </CardContent>
    </Card>
  );
}
