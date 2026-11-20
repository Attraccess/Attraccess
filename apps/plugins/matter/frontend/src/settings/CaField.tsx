import { Button } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Label, TextArea, TextField } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { SettingsDraft } from './useSettingsDraft';

/** The CA certificate (PEM), checked while typing. Clearing it can be undone until the settings are saved. */
export function CaField({ draft }: Readonly<{ draft: SettingsDraft }>) {
  const { t } = useMatterTranslations();
  const { caCleared, caError, base } = draft;
  return (
    <>
      <TextField
        value={caCleared ? '' : draft.ca}
        onChange={draft.setCa}
        isDisabled={caCleared}
        className="mt:w-full"
        isInvalid={caError !== null}
      >
        <Label>{t('form.ca')}</Label>
        <TextArea rows={5} spellCheck={false} data-cy="matter-ca-input" />
        <Description>{caCleared ? t('form.caCleared') : t('form.caDescription')}</Description>
        {caError && <FieldError data-cy="matter-ca-error">{t(`form.validation.${caError}`)}</FieldError>}
      </TextField>
      {base.caCertificate && !caCleared && (
        <Button variant="tertiary" onPress={() => draft.setCaCleared(true)} data-cy="matter-clear-ca">
          {t('form.caClear')}
        </Button>
      )}
      {caCleared && (
        <Button variant="tertiary" onPress={() => draft.setCaCleared(false)} data-cy="matter-undo-clear-ca">
          {t('form.caUndo')}
        </Button>
      )}
    </>
  );
}
