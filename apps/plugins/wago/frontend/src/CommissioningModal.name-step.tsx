import { Input, Label, TextField } from '@heroui/react';
import { useWagoTranslations } from './i18n';

export function NameStep({ name, onNameChange }: { name: string; onNameChange: (name: string) => void }) {
  const { t } = useWagoTranslations();
  return (
    <TextField isRequired name="controller-name">
      <Label>{t('claim.name')}</Label>
      <Input
        autoFocus
        value={name}
        placeholder={t('commissioningUI.namePlaceholder')}
        onChange={(event) => onNameChange(event.target.value)}
      />
    </TextField>
  );
}
