import { cn } from '@heroui/react';
import { ShieldAlertIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { AuthRateLimitForm } from '../../forms/AuthRateLimitForm';
import en from './en.json';
import de from './de.json';

export type AuthRateLimitCardProps = {
  className?: string;
};

export function AuthRateLimitCard({ className }: AuthRateLimitCardProps = {}) {
  const { t } = useTranslations({ en, de });
  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="auth-rate-limit-settings-section"
    >
      <div className="flex items-center gap-2">
        <ShieldAlertIcon size={18} className="text-default-700" />
        <div className="flex flex-col">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('title')}</h3>
          <p className="text-xs text-default-500">{t('subtitle')}</p>
        </div>
      </div>
      <AuthRateLimitForm />
    </section>
  );
}
