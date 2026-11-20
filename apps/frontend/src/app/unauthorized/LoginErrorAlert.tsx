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
}

export function LoginErrorAlert({
  title,
  description,
  isEmailNotVerified,
  identifier,
  password,
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
            <ChangeUnverifiedEmailAction identifier={trimmedIdentifier} password={password} />
          </>
        )}
      </AlertContent>
    </Alert>
  );
}
