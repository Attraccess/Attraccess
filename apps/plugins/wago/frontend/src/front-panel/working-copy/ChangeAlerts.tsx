import { AlertStatusIcon, Button } from '@attraccess/plugins-frontend-ui';
import { Alert } from '@heroui/react';
import { Plus } from 'lucide-react';
import { addDevice, type ChannelEnabledSupport } from '../model';
import type { useFrontPanelState } from './useFrontPanelState';

type Model = ReturnType<typeof useFrontPanelState>;

// Unapplied changes: shown while the working copy differs from the controller's applied configuration.
export function UnappliedChangesAlert({ model }: { model: Model }) {
  if (!model.panel.ready || !model.panel.dirty) return null;
  return (
    <Alert status="warning" className="wg:flex-col wg:items-stretch wg:sm:flex-row wg:sm:items-start">
      <AlertStatusIcon status="warning" />
      <Alert.Content>
        <Alert.Title>{model.t('panel.unapplied')}</Alert.Title>
        <Alert.Description>{model.t('panel.unappliedHint')}</Alert.Description>
      </Alert.Content>
      <div className="wg:flex wg:flex-wrap wg:gap-2">
        <Button
          variant="secondary"
          isDisabled={model.panel.busy || model.panel.pending}
          onPress={() => void model.panel.discard()}
        >
          {model.t('panel.discard')}
        </Button>
        <Button
          isDisabled={model.panel.busy || model.panel.pending || model.panel.conflict}
          isPending={model.panel.busy}
          onPress={model.panel.apply}
        >
          {model.t('panel.apply')}
        </Button>
      </div>
    </Alert>
  );
}

// Manual overrides that stay active until released.
export function ManualOverrideAlert({ model }: { model: Model }) {
  if (model.manualCount <= 0) return null;
  return (
    <Alert status="warning" className="wg:flex-col wg:items-stretch wg:sm:flex-row wg:sm:items-start">
      <AlertStatusIcon status="warning" />
      <Alert.Content>
        <Alert.Title>{model.t('panel.manualActive', { count: model.manualCount })}</Alert.Title>
        <Alert.Description>{model.t('panel.manualHint')}</Alert.Description>
      </Alert.Content>
      <Button
        variant="secondary"
        isDisabled={model.panel.busy || !model.panel.live.enabled}
        onPress={model.panel.release}
      >
        {model.t('panel.release')}
      </Button>
    </Alert>
  );
}

// A new meter's readings depend on the runtime, so adding waits until diagnostics report its capabilities.
export function AddDeviceButton({ model, support }: { model: Model; support: ChannelEnabledSupport }) {
  const supportKnown = support === 'supported' || support === 'unsupported';
  return (
    <div className="wg:flex wg:flex-col wg:items-start wg:gap-1">
      <Button
        variant="outline"
        aria-describedby={supportKnown ? undefined : 'wago-add-device-hint'}
        isDisabled={model.panel.busy || model.panel.pending || !supportKnown}
        onPress={() => {
          if (!model.panel.configuration) return;
          const added = addDevice(model.panel.configuration, model.t('panel.newDevice'), {
            disabledChannels: support === 'supported',
          });
          model.setSelection({ kind: 'device', id: added.id, provisional: added.configuration });
        }}
      >
        <Plus className="wg:size-4" />
        {model.t('panel.addDevice')}
      </Button>
      {!supportKnown && (
        <p id="wago-add-device-hint" role="status" className="wg:text-sm wg:text-muted">
          {model.t(support === 'checking' ? 'panel.readings.checkingAdd' : 'panel.readings.unknownAdd')}
        </p>
      )}
    </div>
  );
}
