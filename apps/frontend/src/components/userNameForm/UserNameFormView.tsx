import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Input, Label, TextField } from '@heroui/react';
import { useCallback } from 'react';
import de from './de.json';
import en from './en.json';

export const USER_NAME_MAX_LENGTH = 100;

interface UserNameFormViewProps {
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  isPending?: boolean;
  /** The identity provider manages the name: the fields are read-only and a hint explains why. */
  isSsoManaged?: boolean;
  /** Shows the admin wording of the SSO hint. */
  isAdminView?: boolean;
}

/** The first and last name fields with their save button, shared by the account and the admin profile forms. */
export function UserNameFormView({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  onSubmit,
  isLoading,
  isPending,
  isSsoManaged,
  isAdminView,
}: Readonly<UserNameFormViewProps>) {
  const { t } = useTranslations({ en, de });
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <TextField
        value={firstName}
        onChange={onFirstNameChange}
        isDisabled={isLoading}
        isReadOnly={isSsoManaged}
        maxLength={USER_NAME_MAX_LENGTH}
      >
        <Label>{t('firstName')}</Label>
        <Input data-cy="first-name-input" />
      </TextField>
      <TextField
        value={lastName}
        onChange={onLastNameChange}
        isDisabled={isLoading}
        isReadOnly={isSsoManaged}
        maxLength={USER_NAME_MAX_LENGTH}
      >
        <Label>{t('lastName')}</Label>
        <Input data-cy="last-name-input" />
      </TextField>
      {isSsoManaged ? (
        <p className="text-sm text-muted" data-cy="name-sso-hint">
          {t(isAdminView ? 'ssoManagedAdmin' : 'ssoManaged')}
        </p>
      ) : (
        <div className={isAdminView ? 'flex w-full justify-end' : undefined}>
          <Button type="submit" variant="primary" isPending={isPending} isDisabled={isLoading}>
            {t('save')}
          </Button>
        </div>
      )}
    </form>
  );
}
