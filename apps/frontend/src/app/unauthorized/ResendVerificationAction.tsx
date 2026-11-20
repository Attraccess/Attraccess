import React, { useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, Input, Label, TextField } from '@heroui/react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResendVerificationEmail } from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { isValidEmail } from '../../utils/email';
import { ApiErrorNotice, toApiErrorNotice } from './apiErrorNotice';
import en from './resendVerificationAction.en.json';
import de from './resendVerificationAction.de.json';

interface ResendVerificationActionProps {
  email: string;
  /** When set, the address is typed into a field (login); otherwise the known address gets the mail in one click. */
  onEmailChange?: (email: string) => void;
}

export function ResendVerificationAction({ email, onEmailChange }: Readonly<ResendVerificationActionProps>) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorNotice | null>(null);
  const hasField = onEmailChange !== undefined;
  const trimmed = email.trim();

  const canSend = isValidEmail(trimmed);
  const resend = useResendVerificationEmail(undefined, {
    onSuccess: () => {
      setError(null);
      setSentTo(trimmed);
    },
    onError: (mutationError) => {
      setSentTo(null);
      setError(toApiErrorNotice(mutationError, t, tExists));
    },
  });

  const send = () => {
    if (!canSend || resend.isPending) return;
    resend.mutate({ body: { email: trimmed } });
  };

  return (
    <div className="w-full space-y-2" data-testid="resend-verification-section">
      {hasField && (
        <>
          <p className="text-sm">{t('prompt')}</p>
          <TextField
            value={email}
            onChange={(value) => {
              onEmailChange(value);
              setError(null);
            }}
          >
            <Label>{t('emailLabel')}</Label>
            <Input
              type="email"
              autoComplete="email"
              data-testid="resend-email-input"
              onKeyDown={(event) => {
                // Inside the login form Enter would sign in again instead of sending the mail.
                if (event.key !== 'Enter') return;
                event.preventDefault();
                send();
              }}
            />
          </TextField>
        </>
      )}
      {error && (
        <Alert status="danger" role="alert" data-testid="resend-error-alert">
          <AlertContent>
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.description}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {sentTo !== null && (
        <Alert status="success" role="status" data-testid="resend-success-alert">
          <AlertContent>
            <AlertTitle>{t('successTitle')}</AlertTitle>
            <AlertDescription>
              {hasField ? t('successMessage') : t('successMessageKnownAddress', { email: sentTo })}
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <Button
        variant="secondary"
        className="w-full"
        onPress={send}
        isPending={resend.isPending}
        isDisabled={!canSend || resend.isPending}
        data-testid="resend-verification-button"
      >
        {hasField ? t('button') : t('confirmationButton')}
      </Button>
    </div>
  );
}
