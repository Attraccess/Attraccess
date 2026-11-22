// Footer actions per phase, like the plugin's other drawers: the dismiss
// button first, the phase's primary action last.
import { BluetoothIcon } from 'lucide-react';
import { Button } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import { SETUP_FORM_ID } from './SetupForm';
import type { SetupPhase } from './useSetupSession';

function dismissLabel(kind: SetupPhase['kind'], supported: boolean): string {
  if (kind === 'done') return 'common.done';
  if (kind === 'failed' || !supported) return 'common.close';
  return 'common.cancel';
}

export function SetupFooter({
  phase,
  supported,
  busy,
  onSelect,
  onRetry,
  onClose,
}: {
  phase: SetupPhase;
  supported: boolean;
  busy: boolean;
  onSelect: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useShellyTranslations();
  const canSelect = supported && (phase.kind === 'start' || phase.kind === 'connecting');
  const done = phase.kind === 'done';
  return (
    <>
      <Button variant={done ? 'primary' : 'secondary'} isDisabled={busy} onPress={onClose} data-cy="shelly-ble-close">
        {t(dismissLabel(phase.kind, supported))}
      </Button>
      {canSelect && (
        <Button
          variant="primary"
          isPending={phase.kind === 'connecting'}
          onPress={onSelect}
          data-cy="shelly-ble-select"
        >
          <BluetoothIcon className="sh:h-4 sh:w-4" /> {t('ble.start.select')}
        </Button>
      )}
      {phase.kind === 'form' && (
        <Button variant="primary" type="submit" form={SETUP_FORM_ID} data-cy="shelly-ble-start">
          <BluetoothIcon className="sh:h-4 sh:w-4" /> {t('ble.begin')}
        </Button>
      )}
      {phase.kind === 'running' && (
        <Button variant="primary" isPending data-cy="shelly-ble-start">
          {t('ble.begin')}
        </Button>
      )}
      {phase.kind === 'failed' && (
        <Button variant="primary" onPress={onRetry} data-cy="shelly-ble-retry">
          {t('ble.failure.retry')}
        </Button>
      )}
    </>
  );
}
