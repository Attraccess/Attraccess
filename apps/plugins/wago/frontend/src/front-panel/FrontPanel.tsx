import { FrontPanelStatusAlerts } from './FrontPanelStatusAlerts';
// Combines controller configuration and live controls on one responsive page.
// FEATURE: WAGO front panel exposes physical terminals and device settings.
import { Alert, Button, Spinner } from '@heroui/react';
import { ArrowLeft, History, Plus } from 'lucide-react';
import { OnboardCard } from './Cards';
import { DeviceSettings } from './DeviceSettings';
import { BusSettings, TerminalSettings } from './SettingsDrawer';
import { addDevice, type Terminal, type PanelConfiguration } from './model';
import { useFrontPanelState } from './useFrontPanelState';
import { FrontPanelModalBackdrop } from './FrontPanelModalBackdrop';
import { FrontPanelPanelDevices } from './FrontPanelPanelDevices';
import { FrontPanelLeaveDialog } from './FrontPanelLeaveDialog';

export type Selection =
  | { kind: 'terminal'; terminal: Terminal }
  | { kind: 'bus' }
  | { kind: 'device'; id: string; provisional?: PanelConfiguration };

export function FrontPanel({
  controllerId,
  onClose,
  onHistory,
}: {
  controllerId: number;
  onClose: () => void;
  onHistory: () => void;
}) {
  const model = useFrontPanelState({ controllerId, onClose, onHistory });

  return (
    <main
      className="wg:mx-auto wg:flex wg:w-full wg:max-w-[1440px] wg:min-w-0 wg:flex-col wg:gap-5 wg:p-4 wg:md:p-6"
      aria-label={model.t('panel.title')}
    >
      <header className="wg:flex wg:flex-col wg:gap-4">
        <div className="wg:flex wg:flex-wrap wg:justify-between wg:gap-2">
          <Button variant="ghost" isDisabled={model.panel.busy} onPress={() => model.navigate(onClose)}>
            <ArrowLeft className="wg:size-4" />
            {model.t('controllers.title')}
          </Button>
          <Button variant="ghost" isDisabled={model.panel.busy} onPress={() => model.navigate(onHistory)}>
            <History className="wg:size-4" />
            {model.t('panel.history')}
          </Button>
        </div>
        <div>
          <p className="wg:text-sm wg:text-muted">
            WAGO / {model.panel.diagnostics.data?.name ?? model.t('editor.controller', { id: controllerId })}
          </p>
          <h1 className="wg:mt-1 wg:text-3xl wg:font-semibold">{model.t('panel.title')}</h1>
        </div>
      </header>
      <FrontPanelStatusAlerts model={model} />
      {model.panel.ready && model.panel.dirty && (
        <Alert status="warning" className="wg:flex-col wg:items-stretch wg:sm:flex-row wg:sm:items-start">
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
              onPress={model.panel.apply}
            >
              {model.panel.busy ? <Spinner size="sm" /> : null}
              {model.t('panel.apply')}
            </Button>
          </div>
        </Alert>
      )}
      {model.panel.conflict && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>{model.t('panel.conflict')}</Alert.Title>
            <Alert.Description>{model.t('panel.conflictHint')}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {model.panel.pending && (
        <Alert status="accent">
          <Alert.Content>
            <Alert.Title>{model.t('panel.applying')}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {model.panel.diagnostics.data?.configuration.rejected && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{model.t('panel.rejected')}</Alert.Title>
            <Alert.Description>
              {model.panel.diagnostics.data.configuration.rejectionErrors
                .map((error) => `${error.path}: ${model.tBackendMessage(error.code)}`)
                .join(', ')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {model.manualCount > 0 && (
        <Alert status="warning" className="wg:flex-col wg:items-stretch wg:sm:flex-row wg:sm:items-start">
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
      )}
      {model.panel.ready && !model.panel.live.enabled && (
        <p role="status" className="wg:text-sm wg:text-muted">
          {model.t('panel.liveUnavailable')}
        </p>
      )}
      {!model.panel.ready && !model.panel.loadError && <Spinner aria-label={model.t('panel.loading')} />}
      {model.panel.ready && model.panel.configuration && (
        <>
          <OnboardCard
            configuration={model.panel.configuration}
            live={model.panel.live}
            disabled={model.panel.busy || model.panel.pending}
            editBus={() => model.setSelection({ kind: 'bus' })}
            editTerminal={(terminal) => model.setSelection({ kind: 'terminal', terminal })}
          />
          <FrontPanelPanelDevices {...model} />
          <Button
            variant="outline"
            className="wg:self-start"
            isDisabled={model.panel.busy || model.panel.pending}
            onPress={() => {
              if (!model.panel.configuration) return;
              const added = addDevice(model.panel.configuration, model.t('panel.newDevice'));
              model.setSelection({ kind: 'device', id: added.id, provisional: added.configuration });
            }}
          >
            <Plus className="wg:size-4" />
            {model.t('panel.addDevice')}
          </Button>
          {model.selection?.kind === 'terminal' && (
            <TerminalSettings
              key={model.selection.terminal.label}
              configuration={model.panel.configuration}
              terminal={model.selection.terminal}
              onChange={model.panel.edit}
              onClose={model.closeSettings}
            />
          )}
          {model.selection?.kind === 'bus' && (
            <BusSettings
              configuration={model.panel.configuration}
              onChange={model.panel.edit}
              onClose={model.closeSettings}
            />
          )}
          {model.device && (
            <DeviceSettings
              key={model.device.id}
              isNew={model.selection?.kind === 'device' && Boolean(model.selection.provisional)}
              configuration={
                model.selection?.kind === 'device'
                  ? (model.selection.provisional ?? model.panel.configuration)
                  : model.panel.configuration
              }
              device={model.device}
              onChange={model.panel.edit}
              onClose={model.closeSettings}
            />
          )}
        </>
      )}
      <FrontPanelModalBackdrop {...model} />
      <FrontPanelLeaveDialog {...model} />
    </main>
  );
}
