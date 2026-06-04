import { cn } from '@heroui/react';
import { MessagesSquareIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { MessagingRateLimitForm } from '../../forms/MessagingRateLimitForm';
import en from './en.json';
import de from './de.json';

export type MessagingRateLimitCardProps = {
  className?: string;
};

export function MessagingRateLimitCard({ className }: MessagingRateLimitCardProps = {}) {
  const { t } = useTranslations({ en, de });
  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="messaging-rate-limit-settings-section"
    >
      <div className="flex items-center gap-2">
        <MessagesSquareIcon size={18} className="text-default-700" />
        <div className="flex flex-col">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('title')}</h3>
          <p className="text-xs text-default-500">{t('subtitle')}</p>
        </div>
      </div>
      <MessagingRateLimitForm />
    </section>
  );
}
