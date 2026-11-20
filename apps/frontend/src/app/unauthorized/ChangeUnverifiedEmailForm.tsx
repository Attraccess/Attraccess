import React, { useRef, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle, FieldError, Input, Label, TextField } from '@heroui/react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useChangeUnverifiedEmail } from '@attraccess/react-query-client';
import API_ERROR_TRANSLATIONS_DE from '../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../global-translations/api-errors.en.json';
import { isValidEmail } from '../../utils/email';
import { ApiErrorNotice, toApiErrorNotice } from './apiErrorNotice';
import en from './changeUnverifiedEmailForm.en.json';
import de from './changeUnverifiedEmailForm.de.json';

interface ChangeUnverifiedEmailFormProps {
  /** Username or email the account signs in with; the credentials stay in memory and prove the account. */
  identifier: string;
  password: string;
  onChanged: (newEmail: string) => void;
  onCancel: () => void;
}

/** Inline form (not a `<form>`, so it may sit inside the login form) that redirects the activation link. */
export function ChangeUnverifiedEmailForm({
  identifier,
  password,
  onChanged,
  onCancel,
}: Readonly<ChangeUnverifiedEmailFormProps>) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState<ApiErrorNotice | null>(null);
  const trimmed = newEmail.trim();
  const isValid = isValidEmail(trimmed);
  // The address the request was sent with, not whatever the field holds when the answer arrives.
  const submitted = useRef('');

  const change = useChangeUnverifiedEmail(undefined, {
    onSuccess: () => onChanged(submitted.current),
    onError: (mutationError) => setError(toApiErrorNotice(mutationError, t, tExists)),
  });

  const submit = () => {
    if (!isValid || change.isPending) return;
    setError(null);
    submitted.current = trimmed;
    change.mutate({ body: { identifier, password, newEmail: trimmed } });
  };

  return (
    <div className="w-full space-y-2" data-testid="change-email-form">
      <TextField
        value={newEmail}
        onChange={(value) => {
          setNewEmail(value);
          setError(null);
        }}
        isInvalid={trimmed.length > 0 && !isValid}
        // Read-only, not disabled: a disabled field would drop the keyboard focus while the request runs.
        isReadOnly={change.isPending}
        // Only this field's message: it sits inside the login form and must not block signing in.
        validationBehavior="aria"
      >
        <Label>{t('emailLabel')}</Label>
        <Input
          type="email"
          autoComplete="email"
          autoFocus
          data-testid="change-email-input"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            } else if (event.key === 'Escape' && !change.isPending) {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        <FieldError data-testid="change-email-invalid-error">{t('invalidEmail')}</FieldError>
      </TextField>
      {error && (
        <Alert status="danger" role="alert" data-testid="change-email-error-alert">
          <AlertContent>
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>{error.description}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onPress={submit}
          isPending={change.isPending}
          isDisabled={!isValid || change.isPending}
          data-testid="change-email-submit"
        >
          {t('submit')}
        </Button>
        <Button variant="secondary" onPress={onCancel} isDisabled={change.isPending} data-testid="change-email-cancel">
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
