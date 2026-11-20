import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Description, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';

export const MAX_NAME_LENGTH = 100;

/** Claims an unclaimed device, with an optional name. The name is trimmed; empty means none. */
export function ClaimDialog({
  isOpen,
  busy,
  onClose,
  onClaim,
}: Readonly<{ isOpen: boolean; busy: boolean; onClose: () => void; onClaim: (displayName?: string) => void }>) {
  const { t } = useMatterTranslations();
  const [name, setName] = useState('');
  const tooLong = name.trim().length > MAX_NAME_LENGTH;
  return (
    <StatusDialog
      isOpen={isOpen}
      status="info"
      title={t('devices.claim.title')}
      onClose={() => {
        setName('');
        onClose();
      }}
      action={{
        label: t('devices.actions.claim'),
        isPending: busy,
        isDisabled: tooLong,
        onPress: () => onClaim(name.trim() === '' ? undefined : name.trim()),
        'data-cy': 'matter-claim-confirm',
      }}
      data-cy="matter-claim-dialog"
    >
      <div className="mt:flex mt:flex-col mt:gap-3">
        <p>{t('devices.claim.text')}</p>
        <TextField value={name} onChange={setName} isInvalid={tooLong}>
          <Label>{t('devices.claim.name')}</Label>
          <Input autoComplete="off" data-cy="matter-claim-name" />
          <Description>{tooLong ? t('devices.validation.nameLength') : t('devices.claim.nameHint')}</Description>
        </TextField>
      </div>
    </StatusDialog>
  );
}
