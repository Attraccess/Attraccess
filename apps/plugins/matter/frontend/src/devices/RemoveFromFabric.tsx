import { ConfirmableButton, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { codeOf } from '../matterApi';
import { useMatterErrorText } from '../useMatterErrorText';
import { removeFromFabric } from './api';

/** Failures after which the device may simply be unreachable, so a forced removal is offered. */
const UNREACHABLE = new Set(['device_unreachable', 'timeout']);

/** Removal-specific wording of a code, before the shared `error.<code>`. */
const removalKey = (code: string) => `devices.remove.error.${code}`;

/**
 * "Remove from fabric": asks the device to leave the Attraccess fabric (other controllers keep it). If the device cannot
 * be reached nothing is changed and a forced removal is offered, which only forgets the device here and says plainly
 * that it may still hold Attraccess credentials. Neither is a factory reset. Render it only with the remove permission,
 * and not for a detached device (the sidecar does not know it; it is repaired or relinked first).
 */
export function RemoveFromFabric({
  nodeRecordId,
  name,
  onChanged,
}: Readonly<{ nodeRecordId: string; name: string; onChanged: () => void }>) {
  const { t } = useMatterTranslations();
  const errorText = useMatterErrorText();
  const [failure, setFailure] = useState<{ error: unknown; unreachable: boolean; timeout: boolean } | null>(null);

  const remove = async (mode: 'normal' | 'force') => {
    try {
      await removeFromFabric(nodeRecordId, mode);
      setFailure(null);
      onChanged();
    } catch (error) {
      const code = codeOf(error);
      setFailure({
        error,
        unreachable: mode === 'normal' && code !== null && UNREACHABLE.has(code),
        timeout: mode === 'normal' && code === 'timeout',
      });
    }
  };

  const removeLabel = t('devices.remove.action');
  const forceLabel = t('devices.remove.force');
  return (
    <div className="mt:flex mt:flex-col mt:gap-2" data-cy="matter-remove">
      <div className="mt:flex mt:flex-wrap mt:gap-2">
        <ConfirmableButton
          label={removeLabel}
          status="warning"
          onConfirm={() => remove('normal')}
          buttonProps={{
            size: 'sm',
            variant: 'secondary',
            'aria-label': t('devices.actionFor', { action: removeLabel, name }),
          }}
          confirm={{
            title: t('devices.remove.confirmTitle', { name }),
            message: t('devices.remove.confirmText'),
            confirmLabel: removeLabel,
            'data-cy': 'matter-remove-dialog',
            confirmDataCy: 'matter-remove-confirm',
          }}
          data-cy="matter-remove-action"
        />
        {failure?.unreachable && (
          <ConfirmableButton
            label={forceLabel}
            status="error"
            onConfirm={() => remove('force')}
            buttonProps={{
              size: 'sm',
              variant: 'danger-soft',
              'aria-label': t('devices.actionFor', { action: forceLabel, name }),
            }}
            confirm={{
              title: t('devices.remove.forceTitle', { name }),
              message: t('devices.remove.forceText'),
              confirmLabel: forceLabel,
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
          title={t(
            failure.timeout
              ? 'devices.remove.timeoutTitle'
              : failure.unreachable
                ? 'devices.remove.unreachableTitle'
                : 'devices.remove.failed',
          )}
          data-cy="matter-remove-error"
        >
          {/* The unreachable and timeout hints say what happened; the server's sentence would repeat it. */}
          <span className="mt:block">
            {failure.timeout
              ? t('devices.remove.timeoutText')
              : failure.unreachable
                ? t('devices.remove.unreachableText')
                : errorText(failure.error, removalKey)}
          </span>
        </StatusAlert>
      )}
    </div>
  );
}
