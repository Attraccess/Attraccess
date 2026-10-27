import React, { useMemo } from 'react';
import { Meter } from '@heroui/react';
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
  const strengthColor =
    score >= policy.minZxcvbnScore ? 'success' : score === policy.minZxcvbnScore - 1 ? 'warning' : 'danger';

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

      <Meter
        aria-label={t('strength.label')}
        value={score + 1}
        minValue={0}
        maxValue={5}
        valueLabel={t(`strength.score.${score}` as const)}
        color={strengthColor}
        size="sm"
        data-cy="password-strength-meter"
        data-score={score}
      >
        <Meter.Track>
          <Meter.Fill />
        </Meter.Track>
      </Meter>

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
