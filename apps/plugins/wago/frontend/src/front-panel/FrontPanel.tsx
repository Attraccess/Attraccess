// Combines controller configuration and live controls on one responsive page.
// FEATURE: WAGO front panel exposes physical terminals and device settings.
import { Button, PageHeader, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';
import { ArrowLeft, History } from 'lucide-react';
import { useState } from 'react';
import { useWagoTranslations } from '../i18n';
import { OnboardCard } from './controls/Cards';
import { FrontPanelDevices } from './controls/FrontPanelDevices';
import { channelEnabledSupport, type Terminal, type PanelConfiguration } from './model';
import { DeviceSettings } from './settings/DeviceSettings';
import { BusSettings } from './settings/BusSettings';
import { TerminalSettings } from './settings/TerminalSettings';
import { AddDeviceButton } from './working-copy/AddDeviceButton';
import { ApplyReviewDialog } from './working-copy/ApplyReviewDialog';
import { FrontPanelLeaveDialog } from './working-copy/FrontPanelLeaveDialog';
import { FrontPanelStatusAlerts } from './working-copy/FrontPanelStatusAlerts';
import { ManualOverrideAlert } from './working-copy/ManualOverrideAlert';
import { UnappliedChangesAlert } from './working-copy/UnappliedChangesAlert';
import { useFrontPanel } from './working-copy/useFrontPanel';

export type Selection =
  | { kind: 'terminal'; terminal: Terminal }
  | { kind: 'bus' }
  | { kind: 'device'; id: string; provisional?: PanelConfiguration };

interface FrontPanelProps {
  controllerId: number;
  onClose: () => void;
  onHistory: () => void;
}

export function FrontPanel({ controllerId, onClose, onHistory }: FrontPanelProps) {
  const { t, tBackendMessage } = useWagoTranslations();
  const panel = useFrontPanel(controllerId);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const closeSettings = () => setSelection(null);
  const navigate = (action: () => void) => (panel.dirty ? setLeave(() => action) : action());
  const device =
    selection?.kind === 'device'
      ? (selection.provisional ?? panel.configuration)?.snapshot.modbus?.devices.find(
          (device) => device.id === selection.id,
        )
      : undefined;
  const manualCount = panel.diagnostics.data?.manualOutputChannelIds?.length ?? 0;
  const support = channelEnabledSupport(panel.diagnostics);
  const flowChannelIds = new Set((panel.diagnostics.data?.references ?? []).map((reference) => reference.channelId));

  return (
    <main
      className="wg:mx-auto wg:flex wg:w-full wg:max-w-[1440px] wg:min-w-0 wg:flex-col wg:gap-5 wg:p-4 wg:md:p-6"
      aria-label={t('panel.title')}
    >
      <header className="wg:flex wg:flex-col wg:gap-4">
        <div className="wg:flex wg:flex-wrap wg:justify-between wg:gap-2">
          <Button variant="ghost" isDisabled={panel.busy} onPress={() => navigate(onClose)}>
            <ArrowLeft className="wg:size-4" />
            {t('controllers.title')}
          </Button>
          <Button variant="ghost" isDisabled={panel.busy} onPress={() => navigate(onHistory)}>
            <History className="wg:size-4" />
            {t('panel.history')}
          </Button>
        </div>
        <PageHeader
          title={t('panel.title')}
          subtitle={`WAGO / ${panel.diagnostics.data?.name ?? t('editor.controller', { id: controllerId })}`}
          noMargin
        />
      </header>
      <FrontPanelStatusAlerts panel={panel} />
      <UnappliedChangesAlert panel={panel} />
      {panel.conflict && (
        <StatusAlert status="warning" title={t('panel.conflict')}>
          {t('panel.conflictHint')}
        </StatusAlert>
      )}
      {panel.pending && <StatusAlert status="accent" title={t('panel.applying')} />}
      {panel.diagnostics.data?.configuration.rejected && (
        <StatusAlert status="danger" title={t('panel.rejected')}>
          {panel.diagnostics.data.configuration.rejectionErrors
            .map((error) => `${error.path}: ${tBackendMessage(error.code)}`)
            .join(', ')}
        </StatusAlert>
      )}
      <ManualOverrideAlert manualCount={manualCount} panel={panel} />
      {panel.ready && !panel.live.enabled && (
        <p role="status" className="wg:text-sm wg:text-muted">
          {t('panel.liveUnavailable')}
        </p>
      )}
      {!panel.ready && !panel.loadError && <TableDataLoadingIndicator />}
      {panel.ready && panel.configuration && (
        <>
          <OnboardCard
            configuration={panel.configuration}
            live={panel.live}
            disabled={panel.busy || panel.pending}
            editBus={() => setSelection({ kind: 'bus' })}
            editTerminal={(terminal) => setSelection({ kind: 'terminal', terminal })}
          />
          <FrontPanelDevices
            configuration={panel.configuration}
            panel={panel}
            onEditDevice={(id) => setSelection({ kind: 'device', id })}
          />
          <AddDeviceButton
            panel={panel}
            support={support}
            onAdded={(id, provisional) => setSelection({ kind: 'device', id, provisional })}
          />
          {selection?.kind === 'terminal' && (
            <TerminalSettings
              key={selection.terminal.label}
              configuration={panel.configuration}
              terminal={selection.terminal}
              onChange={panel.edit}
              onClose={closeSettings}
            />
          )}
          {selection?.kind === 'bus' && (
            <BusSettings configuration={panel.configuration} onChange={panel.edit} onClose={closeSettings} />
          )}
          {device && (
            <DeviceSettings
              key={device.id}
              isNew={selection?.kind === 'device' && Boolean(selection.provisional)}
              support={support}
              flowChannelIds={flowChannelIds}
              configuration={
                selection?.kind === 'device' ? (selection.provisional ?? panel.configuration) : panel.configuration
              }
              device={device}
              onChange={panel.edit}
              onClose={closeSettings}
            />
          )}
        </>
      )}
      <ApplyReviewDialog panel={panel} />
      <FrontPanelLeaveDialog leave={leave} onCancel={() => setLeave(null)} />
    </main>
  );
}
