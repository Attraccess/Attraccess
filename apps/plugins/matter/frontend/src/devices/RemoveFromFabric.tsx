import { ConfirmableButton, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { MatterApiError, removeFromFabric } from '../commissioning/api';
import { errorMessage } from '../errorMessage';
import { useMatterTranslations } from '../i18n';

/** Failures after which the device may simply be unreachable, so a forced removal is offered. */
const UNREACHABLE = new Set(['device_unreachable', 'timeout']);

/**
 * "Remove from fabric": asks the device to leave the Attraccess fabric (other controllers keep it). If the device cannot
 * be reached nothing is changed and a forced removal is offered, which only forgets the device here and says plainly
 * that it may still hold Attraccess credentials. Neither is a factory reset. Render it only with the remove permission.
 */
export function RemoveFromFabric({
  nodeRecordId,
  name,
  onChanged,
}: Readonly<{ nodeRecordId: string; name: string; onChanged: () => void }>) {
  const { t } = useMatterTranslations();
  const [failure, setFailure] = useState<{ message: string; unreachable: boolean } | null>(null);

  const remove = async (mode: 'normal' | 'force') => {
    try {
      await removeFromFabric(nodeRecordId, mode);
      setFailure(null);
      onChanged();
    } catch (error) {
      const code = error instanceof MatterApiError ? error.code : null;
      setFailure({
        message: errorMessage(error),
        unreachable: mode === 'normal' && code !== null && UNREACHABLE.has(code),
      });
    }
  };

  return (
    <div className="mt:flex mt:flex-col mt:gap-2" data-cy="matter-remove">
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <ConfirmableButton
          label={t('devices.remove.action')}
          status="warning"
          onConfirm={() => remove('normal')}
          buttonProps={{ size: 'sm', variant: 'secondary' }}
          confirm={{
            title: t('devices.remove.confirmTitle', { name }),
            message: t('devices.remove.confirmText'),
            confirmLabel: t('devices.remove.action'),
            'data-cy': 'matter-remove-dialog',
            confirmDataCy: 'matter-remove-confirm',
          }}
          data-cy="matter-remove-action"
        />
        {failure?.unreachable && (
          <ConfirmableButton
            label={t('devices.remove.force')}
            status="error"
            onConfirm={() => remove('force')}
            buttonProps={{ size: 'sm', variant: 'danger-soft' }}
            confirm={{
              title: t('devices.remove.forceTitle', { name }),
              message: t('devices.remove.forceText'),
              confirmLabel: t('devices.remove.force'),
              'data-cy': 'matter-force-dialog',
              confirmDataCy: 'matter-force-confirm',
            }}
            data-cy="matter-remove-force"
          />
        )}
      </div>
      {failure && (
        <StatusAlert
          status="danger"
          title={t(failure.unreachable ? 'devices.remove.unreachableTitle' : 'devices.remove.failed')}
          data-cy="matter-remove-error"
        >
          <span className="mt:block">{failure.message}</span>
          {failure.unreachable && <span className="mt:block">{t('devices.remove.unreachableText')}</span>}
        </StatusAlert>
      )}
    </div>
  );
}
