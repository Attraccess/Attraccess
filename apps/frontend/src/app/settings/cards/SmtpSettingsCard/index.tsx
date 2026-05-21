import { Chip, cn } from '@heroui/react';
import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SmtpSettingsForm } from '../../forms/SmtpSettingsForm';
import en from './en.json';
import de from './de.json';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';

export type SmtpSettingsCardVariant = 'standalone' | 'wizard';

export type SmtpSettingsCardProps = {
  variant: SmtpSettingsCardVariant;
  onNext?: () => void;
  className?: string;
};

export function SmtpSettingsCard({ variant, onNext, className }: SmtpSettingsCardProps) {
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
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="smtp-settings-section"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
          {t('title')}
        </h3>
        {passwordChip}
      </div>
      <SmtpSettingsForm variant={variant} endpoint="settings" onNext={onNext} />
    </section>
  );
}
