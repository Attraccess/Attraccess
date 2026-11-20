import React, { useEffect, useRef, useState } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ChangeUnverifiedEmailAction } from './ChangeUnverifiedEmailAction';
import { ResendVerificationAction } from './ResendVerificationAction';
import en from './registrationConfirmation.en.json';
import de from './registrationConfirmation.de.json';

interface RegistrationConfirmationProps {
  email: string;
  /** Kept in memory only, to prove the account when the address is changed. */
  username: string;
  password: string;
  onBackToSignIn: () => void;
}

/** Where self-registration ends: the account exists but cannot sign in until the emailed link was opened. */
export function RegistrationConfirmation({
  email,
  username,
  password,
  onBackToSignIn,
}: Readonly<RegistrationConfirmationProps>) {
  const { t } = useTranslations({ en, de });
  const [currentEmail, setCurrentEmail] = useState(email);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="space-y-6" data-cy="registration-confirmation">
      <div className="space-y-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-3xl font-bold outline-none">
          {t('title')}
        </h2>
        <p>
          {t('lead')}{' '}
          <strong className="break-all" data-cy="registration-confirmation-email">
            {currentEmail}
          </strong>
        </p>
        <p className="font-medium">{t('instruction')}</p>
        <p className="text-sm text-muted">{t('spamHint')}</p>
      </div>
      <div className="space-y-3">
        {/* Keyed so the resend notice does not outlive the address it was about. */}
        <ResendVerificationAction key={currentEmail} email={currentEmail} />
        <ChangeUnverifiedEmailAction identifier={username} password={password} onChanged={setCurrentEmail} />
        <Button
          variant="secondary"
          className="w-full"
          onPress={onBackToSignIn}
          data-cy="registration-confirmation-back-button"
        >
          {t('backToSignIn')}
        </Button>
      </div>
    </div>
  );
}
