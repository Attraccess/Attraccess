import React, { useMemo } from 'react';
import { Check, X, AlertCircle } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  validatePassword,
  PolicyError,
  PolicyErrorCode,
  PublicPasswordPolicy,
} from '@attraccess/shared';
import { useZxcvbn } from './useZxcvbn';
import en from './PasswordPolicyHints.en.json';
import de from './PasswordPolicyHints.de.json';

export interface PasswordPolicyHintsProps {
  password: string;
  username: string;
  email: string;
  policy: PublicPasswordPolicy;
  serverErrors?: PolicyError[];
}

interface RuleSpec {
  id: string;
  label: string;
  satisfied: boolean;
  active: boolean;
}

function formatSeconds(seconds: number, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (!Number.isFinite(seconds)) {
    return t('crack.centuries');
  }
  if (seconds < 1) {
    return t('crack.instant');
  }
  if (seconds < 60) {
    return t('crack.seconds', { value: Math.round(seconds) });
  }
  if (seconds < 3600) {
    return t('crack.minutes', { value: Math.round(seconds / 60) });
  }
  if (seconds < 86400) {
    return t('crack.hours', { value: Math.round(seconds / 3600) });
  }
  if (seconds < 86400 * 30) {
    return t('crack.days', { value: Math.round(seconds / 86400) });
  }
  if (seconds < 86400 * 365) {
    return t('crack.months', { value: Math.round(seconds / (86400 * 30)) });
  }
  if (seconds < 86400 * 365 * 100) {
    return t('crack.years', { value: Math.round(seconds / (86400 * 365)) });
  }
  return t('crack.centuries');
}

export function PasswordPolicyHints({ password, username, email, policy, serverErrors }: PasswordPolicyHintsProps) {
  const { t } = useTranslations({ en, de });
  const sharedPolicy = useMemo(
    () => ({
      ...policy,
      checkHIBP: false,
      checkCommonPasswords: false,
      historySize: 0,
      rotationDays: 0,
    }),
    [policy],
  );

  const localResult = useMemo(
    () => validatePassword(password, sharedPolicy, { username, email }),
    [password, sharedPolicy, username, email],
  );

  const failingCodes = useMemo(
    () => new Set(localResult.errors.map((e) => e.code as PolicyErrorCode)),
    [localResult.errors],
  );

  const rules: RuleSpec[] = useMemo(() => {
    const items: RuleSpec[] = [
      {
        id: 'length',
        label: t('rules.length', { min: policy.minLength, max: policy.maxLength }),
        satisfied: password.length >= policy.minLength && password.length <= policy.maxLength,
        active: true,
      },
      {
        id: 'uppercase',
        label: t('rules.uppercase'),
        satisfied: !failingCodes.has('MISSING_UPPER'),
        active: !!policy.requireUppercase,
      },
      {
        id: 'lowercase',
        label: t('rules.lowercase'),
        satisfied: !failingCodes.has('MISSING_LOWER'),
        active: !!policy.requireLowercase,
      },
      {
        id: 'digit',
        label: t('rules.digit'),
        satisfied: !failingCodes.has('MISSING_DIGIT'),
        active: !!policy.requireDigit,
      },
      {
        id: 'special',
        label: t('rules.special'),
        satisfied: !failingCodes.has('MISSING_SPECIAL'),
        active: !!policy.requireSpecial,
      },
      {
        id: 'similarity',
        label: t('rules.similarity'),
        satisfied: !failingCodes.has('SIMILAR_TO_EMAIL') && !failingCodes.has('SIMILAR_TO_USERNAME'),
        active: true,
      },
    ];
    if (!policy.allowAllUnicode) {
      items.push({
        id: 'ascii',
        label: t('rules.ascii'),
        satisfied: !failingCodes.has('DISALLOWED_CHARACTER'),
        active: true,
      });
    }
    return items.filter((r) => r.active);
  }, [t, password, policy, failingCodes]);

  const zxcvbn = useZxcvbn(password, [username, email]);
  const score = zxcvbn.result?.score ?? 0;
  const meetsScore = score >= policy.minZxcvbnScore;
  const crackTime = useMemo(() => {
    const seconds = zxcvbn.result?.crackTimes.offlineSlowHashingXPerSecond.seconds;
    return formatSeconds(typeof seconds === 'number' ? seconds : Number(seconds ?? 0), t);
  }, [zxcvbn.result, t]);

  const strengthColor = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'][score];

  return (
    <div className="space-y-3" data-cy="password-policy-hints">
      <ul className="space-y-1 text-sm" data-cy="password-policy-checklist">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center gap-2"
            data-cy={`password-policy-rule-${rule.id}`}
            data-satisfied={rule.satisfied}
          >
            {rule.satisfied ? (
              <Check className="h-4 w-4 text-green-600" aria-hidden />
            ) : (
              <X className="h-4 w-4 text-red-500" aria-hidden />
            )}
            <span className={rule.satisfied ? 'text-foreground' : 'text-foreground-500'}>{rule.label}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1" data-cy="password-strength-meter">
        <div className="flex items-center justify-between text-xs">
          <span>
            {t('strength.label')}: {t(`strength.score.${score}` as const)}
          </span>
          <span data-cy="password-strength-crack-time">
            {t('strength.crackTime')}: {crackTime}
          </span>
        </div>
        <div className="h-2 w-full rounded bg-default-200">
          <div
            className={`h-2 rounded transition-all ${strengthColor}`}
            style={{ width: `${((score + 1) / 5) * 100}%` }}
            data-cy={`password-strength-bar-${score}`}
          />
        </div>
        {!meetsScore && password.length > 0 && (
          <p className="text-xs text-warning" data-cy="password-strength-required">
            {t('strength.minRequired', { required: policy.minZxcvbnScore })}
          </p>
        )}
      </div>

      {serverErrors && serverErrors.length > 0 && (
        <ul className="space-y-1 text-sm text-danger" data-cy="password-policy-server-errors">
          {serverErrors.map((err, idx) => (
            <li key={`${err.code}-${idx}`} className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <span>{t(`serverErrors.${err.code}` as const, err.params as Record<string, string | number>)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
