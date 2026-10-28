import { FrontPanelStatusAlerts } from './working-copy/StatusAlerts';
// Combines controller configuration and live controls on one responsive page.
// FEATURE: WAGO front panel exposes physical terminals and device settings.
import { AlertStatusIcon, PageHeader, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { Alert, Button, Spinner } from '@heroui/react';
import { ArrowLeft, History, Plus } from 'lucide-react';
import { OnboardCard } from './controls/Cards';
import { DeviceSettings } from './settings/DeviceSettings';
import { BusSettings, TerminalSettings } from './settings/SettingsDrawer';
import { addDevice, type Terminal, type PanelConfiguration } from './model';
import { useFrontPanelState } from './working-copy/useFrontPanelState';
import { FrontPanelModalBackdrop } from './working-copy/ModalBackdrop';
import { FrontPanelPanelDevices } from './controls/Devices';
import { FrontPanelLeaveDialog } from './working-copy/LeaveDialog';

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
        <PageHeader
          title={model.t('panel.title')}
          subtitle={`WAGO / ${model.panel.diagnostics.data?.name ?? model.t('editor.controller', { id: controllerId })}`}
          noMargin
        />
      </header>
      <FrontPanelStatusAlerts model={model} />
      {model.panel.ready && model.panel.dirty && (
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
              onPress={model.panel.apply}
            >
              {model.panel.busy ? <Spinner size="sm" /> : null}
              {model.t('panel.apply')}
            </Button>
          </div>
        </Alert>
      )}
      {model.panel.conflict && (
        <StatusAlert status="warning" title={model.t('panel.conflict')}>
          {model.t('panel.conflictHint')}
        </StatusAlert>
      )}
      {model.panel.pending && <StatusAlert status="accent" title={model.t('panel.applying')} />}
      {model.panel.diagnostics.data?.configuration.rejected && (
        <StatusAlert status="danger" title={model.t('panel.rejected')}>
          {model.panel.diagnostics.data.configuration.rejectionErrors
            .map((error) => `${error.path}: ${model.tBackendMessage(error.code)}`)
            .join(', ')}
        </StatusAlert>
      )}
      {model.manualCount > 0 && (
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
      )}
      {model.panel.ready && !model.panel.live.enabled && (
        <p role="status" className="wg:text-sm wg:text-muted">
          {model.t('panel.liveUnavailable')}
        </p>
      )}
      {!model.panel.ready && !model.panel.loadError && <TableDataLoadingIndicator />}
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
