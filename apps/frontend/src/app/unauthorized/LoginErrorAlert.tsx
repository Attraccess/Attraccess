import React, { useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { isValidEmail } from '../../utils/email';
import { ChangeUnverifiedEmailAction } from './ChangeUnverifiedEmailAction';
import { ResendVerificationAction } from './ResendVerificationAction';

interface LoginErrorAlertProps {
  title: string;
  description: string;
  /** The account's credentials were right but its email is unverified: offer to resend or change it here. */
  isEmailNotVerified: boolean;
  /** The identifier and password just submitted. */
  identifier: string;
  password: string;
  /** Called with the new address after the account's email was changed from this card. */
  onEmailChanged?: (newEmail: string) => void;
}

export function LoginErrorAlert({
  title,
  description,
  isEmailNotVerified,
  identifier,
  password,
  onEmailChanged,
}: Readonly<LoginErrorAlertProps>) {
  const trimmedIdentifier = identifier.trim();
  const [resendEmail, setResendEmail] = useState(isValidEmail(trimmedIdentifier) ? trimmedIdentifier : '');

  return (
    <Alert status="danger" role="alert" data-cy="login-form-error-alert">
      <AlertContent className="space-y-3">
        <div>
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </div>
        {isEmailNotVerified && (
          <>
            <ResendVerificationAction email={resendEmail} onEmailChange={setResendEmail} />
            <ChangeUnverifiedEmailAction
              identifier={trimmedIdentifier}
              password={password}
              onChanged={(newEmail) => {
                setResendEmail(newEmail);
                onEmailChanged?.(newEmail);
              }}
            />
          </>
        )}
      </AlertContent>
    </Alert>
  );
}
