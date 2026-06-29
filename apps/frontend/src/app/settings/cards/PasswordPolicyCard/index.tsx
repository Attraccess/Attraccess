import { Button, Chip, cn, Spinner } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  PasswordPolicyDto,
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
} from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export type PasswordPolicyCardProps = {
  className?: string;
};

function policyChips(policy: PasswordPolicyDto, t: (key: string, vars?: Record<string, string | number>) => string): string[] {
  const chips: string[] = [];
  chips.push(t('summary.minLength', { count: policy.minLength }));
  if (policy.requireUppercase) chips.push(t('summary.requireUppercase'));
  if (policy.requireLowercase) chips.push(t('summary.requireLowercase'));
  if (policy.requireDigit) chips.push(t('summary.requireDigit'));
  if (policy.requireSpecial) chips.push(t('summary.requireSpecial'));
  if (policy.minZxcvbnScore > 0) chips.push(t('summary.zxcvbn', { score: policy.minZxcvbnScore }));
  if (policy.checkHIBP) chips.push(t('summary.hibp'));
  if (policy.historySize > 0) chips.push(t('summary.history', { count: policy.historySize }));
  if (policy.rotationDays > 0) chips.push(t('summary.rotation', { days: policy.rotationDays }));
  return chips;
}

export function PasswordPolicyCard({ className }: PasswordPolicyCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { data: policy, isLoading } = usePasswordPolicyAdminServiceGetAdminPasswordPolicy();

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

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-default-500">
          <Spinner size="sm" />
          {t('loading')}
        </div>
      )}

      {policy && (
        <div className="flex flex-wrap gap-1.5">
          {policyChips(policy, t).map((chip) => (
            <Chip key={chip} variant="soft" color="default">
              {chip}
            </Chip>
          ))}
        </div>
      )}

      <div>
        <Button variant="primary" onPress={() => navigate('/users/security/password-policy')}>
          {t('openButton')}
        </Button>
      </div>
    </section>
  );
}
