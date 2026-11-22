import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { Checkbox } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';

/**
 * The dangerous development override: starts a NEW commissioning attempt that accepts a failed attestation. It needs an
 * explicit confirmation of the risk each time. The setup code stays in memory in the parent for this retry only.
 */
export function OverrideDialog({
  isOpen,
  findings,
  busy,
  onClose,
  onConfirm,
}: Readonly<{ isOpen: boolean; findings: string[]; busy: boolean; onClose: () => void; onConfirm: () => void }>) {
  const { t } = useMatterTranslations();
  const [confirmed, setConfirmed] = useState(false);
  const close = () => {
    setConfirmed(false);
    onClose();
  };
  return (
    <StatusDialog
      isOpen={isOpen}
      status="error"
      title={t('commissioning.override.title')}
      onClose={close}
      action={{
        label: t('commissioning.override.confirm'),
        isPending: busy,
        isDisabled: !confirmed,
        onPress: onConfirm,
        'data-cy': 'matter-override-confirm',
      }}
      data-cy="matter-override-dialog"
    >
      <div className="mt:flex mt:flex-col mt:gap-3">
        <p>{t('commissioning.override.risk')}</p>
        {findings.length > 0 && (
          <p className="mt:text-sm">
            {t('commissioning.override.findings')} {findings.join(', ')}
          </p>
        )}
        <Checkbox isSelected={confirmed} onChange={setConfirmed} data-cy="matter-override-ack">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('commissioning.override.acknowledge')}
          </Checkbox.Content>
        </Checkbox>
      </div>
    </StatusDialog>
  );
}
