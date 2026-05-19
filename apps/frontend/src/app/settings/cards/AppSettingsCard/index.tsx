import { Chip } from '@heroui/react';
import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
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
    <section
      className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0"
      data-cy="app-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('title')}
        </h3>
        {licenseChip}
      </div>
      <AppSettingsForm variant={variant} endpoint="settings" onNext={onNext} />
    </section>
  );
}
