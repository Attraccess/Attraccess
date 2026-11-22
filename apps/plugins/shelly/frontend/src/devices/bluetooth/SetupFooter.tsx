import { BluetoothIcon } from 'lucide-react';
import { Button } from '@attraccess/plugins-frontend-ui';
import { useShellyTranslations } from '../../i18n';
import type { SetupPhase } from './useSetupSession';

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
  return (
    <>
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
      {phase.kind === 'failed' && (
        <Button variant="secondary" onPress={onRetry} data-cy="shelly-ble-retry">
          {t('ble.failure.retry')}
        </Button>
      )}
      <Button
        variant={phase.kind === 'done' ? 'primary' : 'secondary'}
        isDisabled={busy}
        onPress={onClose}
        data-cy="shelly-ble-close"
      >
        {t(phase.kind === 'done' ? 'common.done' : 'common.close')}
      </Button>
    </>
  );
}
