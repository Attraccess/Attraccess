import { Button, PasswordInput, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { ValidationKey } from '../settingsValidation';

/**
 * The token is write-only: while one is stored, this only shows that it is configured and offers to replace it. It asks
 * for the token when there is none, when the user replaces it, or when the URL or CA changed (a stored token is only
 * sent to the endpoint it was entered for).
 */
export function CredentialField({
  configured,
  configuredAt,
  needed,
  endpointChanged,
  value,
  error,
  onChange,
  onReplacingChange,
}: Readonly<{
  /** Whether a token is stored. */
  configured: boolean;
  configuredAt: string | null;
  /** Whether the form asks for a token (none stored, replacing it, or the endpoint changed). */
  needed: boolean;
  endpointChanged: boolean;
  value: string;
  error: ValidationKey;
  onChange: (value: string) => void;
  onReplacingChange: (replacing: boolean) => void;
}>) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({});

  if (!needed) {
    return (
      <div
        className="mt:flex mt:flex-wrap mt:items-center mt:justify-between mt:gap-2"
        data-cy="matter-credential-configured"
      >
        <span>
          {t('form.credential')}: {t('form.credentialConfigured', { time: formatDateTime(configuredAt) })}
        </span>
        <Button variant="secondary" onPress={() => onReplacingChange(true)} data-cy="matter-replace-credential">
          {t('form.replace')}
        </Button>
      </div>
    );
  }
  return (
    <div className="mt:flex mt:flex-col mt:gap-2">
      <PasswordInput
        label={t('form.credential')}
        description={endpointChanged ? t('form.credentialReenter') : t('form.credentialDescription')}
        autoComplete="new-password"
        value={value}
        onValueChange={onChange}
        isInvalid={error !== null}
        errorMessage={error && <span data-cy="matter-credential-error">{t(`form.validation.${error}`)}</span>}
        data-cy="matter-credential-input"
      />
      {configured && !endpointChanged && (
        <Button variant="tertiary" onPress={() => onReplacingChange(false)} data-cy="matter-keep-credential">
          {t('form.cancelReplace')}
        </Button>
      )}
    </div>
  );
}
