import { Button } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Label, TextArea, TextField } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { ValidationKey } from '../settingsValidation';

/** The CA certificate (PEM), checked while typing. Clearing it can be undone until the settings are saved. */
export function CaField({
  value,
  stored,
  cleared,
  error,
  onChange,
  onClearedChange,
}: Readonly<{
  value: string;
  /** Whether the saved settings have a CA certificate (only then it can be cleared). */
  stored: boolean;
  cleared: boolean;
  error: ValidationKey;
  onChange: (value: string) => void;
  onClearedChange: (cleared: boolean) => void;
}>) {
  const { t } = useMatterTranslations();
  return (
    <>
      <TextField
        value={cleared ? '' : value}
        onChange={onChange}
        isDisabled={cleared}
        className="mt:w-full"
        isInvalid={error !== null}
      >
        <Label>{t('form.ca')}</Label>
        <TextArea rows={5} spellCheck={false} data-cy="matter-ca-input" />
        <Description>{cleared ? t('form.caCleared') : t('form.caDescription')}</Description>
        {error && <FieldError data-cy="matter-ca-error">{t(`form.validation.${error}`)}</FieldError>}
      </TextField>
      {stored && !cleared && (
        <Button variant="tertiary" onPress={() => onClearedChange(true)} data-cy="matter-clear-ca">
          {t('form.caClear')}
        </Button>
      )}
      {cleared && (
        <Button variant="tertiary" onPress={() => onClearedChange(false)} data-cy="matter-undo-clear-ca">
          {t('form.caUndo')}
        </Button>
      )}
    </>
  );
}
