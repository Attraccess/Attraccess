import { Chip, cn } from '@heroui/react';
import { CheckIcon, GlobeIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AppSettingsForm } from '../../forms/AppSettingsForm';
import en from './en.json';
import de from './de.json';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';

export type AppSettingsCardVariant = 'standalone' | 'wizard';

export type AppSettingsCardProps = {
  variant: AppSettingsCardVariant;
  onNext?: () => void;
  className?: string;
};

export function AppSettingsCard({ variant, onNext, className }: AppSettingsCardProps) {
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
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="app-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-default-700">
          <GlobeIcon size={18} />
          <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
        </div>
        {licenseChip}
      </div>
      <AppSettingsForm variant={variant} endpoint="settings" onNext={onNext} />
    </section>
  );
}
