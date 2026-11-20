import { Button, PasswordInput, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { SettingsDraft } from './useSettingsDraft';

/**
 * The token is write-only: while one is stored, this only shows that it is configured and offers to replace it. It asks
 * for the token when there is none, when the user replaces it, or when the URL or CA changed (a stored token is only
 * sent to the endpoint it was entered for).
 */
export function CredentialField({ draft }: Readonly<{ draft: SettingsDraft }>) {
  const { t } = useMatterTranslations();
  const formatDateTime = useDateTimeFormatter({});
  const { base, endpointChanged, credentialError } = draft;

  if (!draft.needsCredential) {
    return (
      <div
        className="mt:flex mt:flex-wrap mt:items-center mt:justify-between mt:gap-2"
        data-cy="matter-credential-configured"
      >
        <span>
          {t('form.credential')}: {t('form.credentialConfigured', { time: formatDateTime(base.credentialUpdatedAt) })}
        </span>
        <Button variant="secondary" onPress={() => draft.setReplacing(true)} data-cy="matter-replace-credential">
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
        value={draft.credential}
        onValueChange={draft.setCredential}
        isInvalid={credentialError !== null}
        errorMessage={
          credentialError && <span data-cy="matter-credential-error">{t(`form.validation.${credentialError}`)}</span>
        }
        data-cy="matter-credential-input"
      />
      {base.credentialConfigured && !endpointChanged && (
        <Button variant="tertiary" onPress={() => draft.setReplacing(false)} data-cy="matter-keep-credential">
          {t('form.cancelReplace')}
        </Button>
      )}
    </div>
  );
}
