import { Card, CardContent, CardHeader, Chip } from '@heroui/react';
import { CheckIcon, Settings2Icon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../../components/pageHeader';
import { AppSettingsForm } from '../../forms/AppSettingsForm';
import en from './en.json';
import de from './de.json';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';

export type AppSettingsCardVariant = 'standalone' | 'wizard';

export type AppSettingsCardProps = {
  variant: AppSettingsCardVariant;
  onNext?: () => void;
};

export function AppSettingsCard({ variant, onNext }: AppSettingsCardProps) {
  const { t } = useTranslations({ en, de });

  const { data: settings } = useSettingsServiceGetSystemSettings();

  const licenseChip =
    variant === 'standalone' && settings ? (
      <Chip color={settings.app.licenseKeyConfigured ? 'success' : 'warning'} variant="soft">
        <div className="flex items-center gap-2">
          {settings.app.licenseKeyConfigured ? <CheckIcon size={16} /> : <XIcon size={16} />}
          {settings.app.licenseKeyConfigured
            ? t('licenseStatus.configured')
            : t('licenseStatus.missing')}
        </div>
      </Chip>
    ) : null;

  return (
    <Card className="flex-1 min-w-[300px]">
      <CardHeader>
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<Settings2Icon size={18} />}
          noMargin
          actions={licenseChip}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AppSettingsForm variant={variant} endpoint="settings" onNext={onNext} />
      </CardContent>
    </Card>
  );
}
