import { Button, cn } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

export type PasswordPolicyCardProps = {
  className?: string;
};

export function PasswordPolicyCard({ className }: PasswordPolicyCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="password-policy-settings-section"
    >
      <div className="flex items-center gap-2">
        <ShieldCheckIcon size={18} className="text-default-700" />
        <div className="flex flex-col">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('title')}</h3>
          <p className="text-xs text-default-500">{t('subtitle')}</p>
        </div>
      </div>
      <div>
        <Button variant="primary" onPress={() => navigate('/settings/security/password-policy')}>
          {t('openButton')}
        </Button>
      </div>
    </section>
  );
}
