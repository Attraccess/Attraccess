import React, { useCallback, useMemo } from 'react';
import { Button } from '@heroui/react';
import { Wand2 } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordInput } from '../PasswordInput';
import { PasswordPolicyHints, generateStrongPassword } from '../PasswordPolicyHints';
import { useToastMessage } from '../toastProvider';
import { usePasswordPolicyServiceGetPublicPasswordPolicy } from '@attraccess/react-query-client';
import { PolicyError, PublicPasswordPolicy } from '@attraccess/shared';
import en from './PasswordField.en.json';
import de from './PasswordField.de.json';

export const FALLBACK_PUBLIC_POLICY: PublicPasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  allowAllUnicode: true,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  minZxcvbnScore: 3,
};

interface BasePasswordFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  username?: string;
  email?: string;
  policy?: PublicPasswordPolicy;
  serverErrors?: PolicyError[];
  passwordLabel?: string;
  showGenerator?: boolean;
  isRequired?: boolean;
  autoComplete?: 'new-password' | 'current-password';
  dataCyPrefix?: string;
  hintsHidden?: boolean;
}

interface PasswordFieldWithoutConfirmation {
  showConfirmation?: false;
  confirmationValue?: never;
  onConfirmationChange?: never;
  confirmationLabel?: never;
}

interface PasswordFieldWithConfirmation {
  showConfirmation: true;
  confirmationValue: string;
  onConfirmationChange: (value: string) => void;
  confirmationLabel?: string;
}

export type PasswordFieldProps = BasePasswordFieldProps &
  (PasswordFieldWithoutConfirmation | PasswordFieldWithConfirmation);

export function PasswordField(props: PasswordFieldProps) {
  const {
    value,
    onValueChange,
    username = '',
    email = '',
    policy,
    serverErrors,
    passwordLabel,
    showGenerator = true,
    isRequired = false,
    autoComplete = 'new-password',
    dataCyPrefix,
    hintsHidden = false,
  } = props;
  const showConfirmation = props.showConfirmation === true;
  const confirmationValue = showConfirmation ? props.confirmationValue : '';
  const onConfirmationChange = showConfirmation ? props.onConfirmationChange : undefined;
  const confirmationLabel = showConfirmation ? props.confirmationLabel : undefined;
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();

  const { data: fetchedPolicy } = usePasswordPolicyServiceGetPublicPasswordPolicy(undefined, {
    enabled: !policy,
  });

  const effectivePolicy: PublicPasswordPolicy = useMemo(
    () => policy ?? (fetchedPolicy as PublicPasswordPolicy | undefined) ?? FALLBACK_PUBLIC_POLICY,
    [policy, fetchedPolicy],
  );

  const passwordsMismatch = useMemo(() => {
    if (!showConfirmation || !value || !confirmationValue) {
      return false;
    }
    return value !== confirmationValue;
  }, [showConfirmation, value, confirmationValue]);

  const handleGenerate = useCallback(async () => {
    const generated = generateStrongPassword({
      length: Math.max(20, effectivePolicy.minLength + 4),
      requireUppercase: effectivePolicy.requireUppercase,
      requireLowercase: effectivePolicy.requireLowercase,
      requireDigit: effectivePolicy.requireDigit,
      requireSpecial: effectivePolicy.requireSpecial,
    });
    onValueChange(generated);
    if (showConfirmation && onConfirmationChange) {
      onConfirmationChange(generated);
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generated);
        toast.success({ title: t('generatedCopied') });
      } else {
        toast.success({ title: t('generated') });
      }
    } catch {
      toast.success({ title: t('generated') });
    }
  }, [effectivePolicy, onValueChange, onConfirmationChange, showConfirmation, toast, t]);

  const cy = (suffix: string) => (dataCyPrefix ? `${dataCyPrefix}-${suffix}` : undefined);

  return (
    <div className="flex flex-col gap-3" data-cy={cy('password-field')}>
      <PasswordInput
        label={passwordLabel ?? t('passwordLabel')}
        value={value}
        onValueChange={onValueChange}
        autoComplete={autoComplete}
        isRequired={isRequired}
        required={isRequired}
        data-cy={cy('password-input')}
      />

      {showGenerator && (
        <Button
          variant="flat"
          color="secondary"
          onPress={handleGenerate}
          startContent={<Wand2 className="h-4 w-4" />}
          data-cy={cy('generate-password-button')}
          type="button"
        >
          {t('generate')}
        </Button>
      )}

      {!hintsHidden && (
        <PasswordPolicyHints
          password={value}
          username={username}
          email={email}
          policy={effectivePolicy}
          serverErrors={serverErrors}
        />
      )}

      {showConfirmation && (
        <PasswordInput
          label={confirmationLabel ?? t('confirmLabel')}
          value={confirmationValue}
          onValueChange={onConfirmationChange}
          autoComplete={autoComplete}
          isRequired={isRequired}
          required={isRequired}
          data-cy={cy('password-confirmation-input')}
          validate={() => (passwordsMismatch ? t('passwordsDoNotMatch') : true)}
          isInvalid={passwordsMismatch}
          errorMessage={passwordsMismatch ? t('passwordsDoNotMatch') : undefined}
        />
      )}
    </div>
  );
}
