import React, { useEffect, useRef, useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { ChangeUnverifiedEmailForm } from './ChangeUnverifiedEmailForm';
import en from './changeUnverifiedEmailForm.en.json';
import de from './changeUnverifiedEmailForm.de.json';

interface ChangeUnverifiedEmailActionProps {
  identifier: string;
  password: string;
  /** Called after the address was changed, with the new address. */
  onChanged?: (newEmail: string) => void;
}

/** The "Change email address" button that opens the inline form and reports the outcome. */
export function ChangeUnverifiedEmailAction({
  identifier,
  password,
  onChanged,
}: Readonly<ChangeUnverifiedEmailActionProps>) {
  const { t } = useTranslations({ en, de });
  const [isOpen, setIsOpen] = useState(false);
  const [changedTo, setChangedTo] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // The form unmounts with focus inside it; hand focus back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      containerRef.current?.querySelector<HTMLButtonElement>('[data-testid="change-email-open-button"]')?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <div ref={containerRef} className="w-full space-y-2">
      {changedTo !== null && (
        <Alert status="success" role="status" data-testid="change-email-success-alert">
          <AlertContent>
            <AlertTitle>{t('successTitle')}</AlertTitle>
            <AlertDescription>{t('successMessage', { email: changedTo })}</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {isOpen ? (
        <ChangeUnverifiedEmailForm
          identifier={identifier}
          password={password}
          onCancel={() => setIsOpen(false)}
          onChanged={(newEmail) => {
            setIsOpen(false);
            setChangedTo(newEmail);
            onChanged?.(newEmail);
          }}
        />
      ) : (
        <Button
          variant="secondary"
          className="w-full"
          onPress={() => setIsOpen(true)}
          data-testid="change-email-open-button"
        >
          {t('openButton')}
        </Button>
      )}
    </div>
  );
}
