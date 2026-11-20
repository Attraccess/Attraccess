import { Button } from '@attraccess/plugins-frontend-ui';
import { Plus } from 'lucide-react';
import { useWagoTranslations } from '../../i18n';
import { addDevice, type ChannelEnabledSupport, type PanelConfiguration } from '../model';
import type { FrontPanelWorkingCopy } from './useFrontPanel';

interface AddDeviceButtonProps {
  panel: Pick<FrontPanelWorkingCopy, 'configuration' | 'busy' | 'pending'>;
  support: ChannelEnabledSupport;
  onAdded: (id: string, provisional: PanelConfiguration) => void;
}

/** A new meter's readings depend on the runtime, so adding waits until diagnostics report its capabilities. */
export function AddDeviceButton({ panel, support, onAdded }: AddDeviceButtonProps) {
  const { t } = useWagoTranslations();
  const supportKnown = support === 'supported' || support === 'unsupported';
  return (
    <div className="wg:flex wg:flex-col wg:items-start wg:gap-1">
      <Button
        variant="outline"
        aria-describedby={supportKnown ? undefined : 'wago-add-device-hint'}
        isDisabled={panel.busy || panel.pending || !supportKnown}
        onPress={() => {
          if (!panel.configuration) return;
          const added = addDevice(panel.configuration, t('panel.newDevice'), {
            disabledChannels: support === 'supported',
          });
          onAdded(added.id, added.configuration);
        }}
      >
        <Plus className="wg:size-4" />
        {t('panel.addDevice')}
      </Button>
      {!supportKnown && (
        <p id="wago-add-device-hint" role="status" className="wg:text-sm wg:text-muted">
          {t(support === 'checking' ? 'panel.readings.checkingAdd' : 'panel.readings.unknownAdd')}
        </p>
      )}
    </div>
  );
}
