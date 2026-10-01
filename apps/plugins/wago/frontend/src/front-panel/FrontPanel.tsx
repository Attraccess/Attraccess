// Combines controller configuration and live controls on one responsive page.
// FEATURE: WAGO front panel exposes physical terminals and device settings.
import { Alert, Button, Modal, Spinner } from '@heroui/react';
import { ArrowLeft, History, Plus } from 'lucide-react';
import { useState } from 'react';
import { useWagoTranslations } from '../i18n';
import { ConfigurationErrors } from '../ConfigurationChanges';
import { DeviceCard, OnboardCard } from './Cards';
import { DeviceSettings } from './DeviceSettings';
import { BusSettings, TerminalSettings } from './SettingsDrawer';
import { addDevice, type Terminal, type PanelConfiguration } from './model';
import { useFrontPanel } from './useFrontPanel';

type Selection =
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
        <div>
          <p className="wg:text-sm wg:text-muted">
            WAGO / {panel.diagnostics.data?.name ?? t('editor.controller', { id: controllerId })}
          </p>
          <h1 className="wg:mt-1 wg:text-3xl wg:font-semibold">{t('panel.title')}</h1>
        </div>
      </header>
      {panel.loadError && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{t('panel.loadError')}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {(panel.errorKey || panel.backendError) && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{panel.errorKey ? t(panel.errorKey) : t('panel.applyError')}</Alert.Title>
            {panel.backendError && (
              <Alert.Description className="wg:whitespace-pre-wrap wg:break-words">
                {tBackendMessage(panel.backendError)}
              </Alert.Description>
            )}
            {panel.validationErrors.length > 0 && panel.configuration && (
              <ConfigurationErrors
                errors={panel.validationErrors}
                snapshot={panel.configuration.snapshot}
                names={panel.configuration.metadata.names}
              />
            )}
          </Alert.Content>
        </Alert>
      )}
      {panel.ready && panel.dirty && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>{t('panel.unapplied')}</Alert.Title>
            <Alert.Description>{t('panel.unappliedHint')}</Alert.Description>
          </Alert.Content>
          <div className="wg:flex wg:flex-wrap wg:gap-2">
            <Button variant="secondary" isDisabled={panel.busy || panel.pending} onPress={() => void panel.discard()}>
              {t('panel.discard')}
            </Button>
            <Button isDisabled={panel.busy || panel.pending || panel.conflict} onPress={panel.apply}>
              {panel.busy ? <Spinner size="sm" /> : null}
              {t('panel.apply')}
            </Button>
          </div>
        </Alert>
      )}
      {panel.conflict && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>{t('panel.conflict')}</Alert.Title>
            <Alert.Description>{t('panel.conflictHint')}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {panel.pending && (
        <Alert status="accent">
          <Alert.Content>
            <Alert.Title>{t('panel.applying')}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
      {panel.diagnostics.data?.configuration.rejected && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{t('panel.rejected')}</Alert.Title>
            <Alert.Description>
              {panel.diagnostics.data.configuration.rejectionErrors
                .map((error) => `${error.path}: ${tBackendMessage(error.code)}`)
                .join(', ')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {manualCount > 0 && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>{t('panel.manualActive', { count: manualCount })}</Alert.Title>
            <Alert.Description>{t('panel.manualHint')}</Alert.Description>
          </Alert.Content>
          <Button variant="secondary" isDisabled={panel.busy || !panel.live.enabled} onPress={panel.release}>
            {t('panel.release')}
          </Button>
        </Alert>
      )}
      {panel.ready && !panel.live.enabled && (
        <p role="status" className="wg:text-sm wg:text-muted">
          {t('panel.liveUnavailable')}
        </p>
      )}
      {!panel.ready && !panel.loadError && <Spinner aria-label={t('panel.loading')} />}
      {panel.ready && panel.configuration && (
        <>
          <OnboardCard
            configuration={panel.configuration}
            live={panel.live}
            disabled={panel.busy || panel.pending}
            editBus={() => setSelection({ kind: 'bus' })}
            editTerminal={(terminal) => setSelection({ kind: 'terminal', terminal })}
          />
          <section
            aria-label={t('panel.devices')}
            className="wg:grid wg:grid-cols-1 wg:gap-4 wg:md:grid-cols-2 wg:xl:grid-cols-3"
          >
            {panel.configuration.snapshot.modbus?.devices.map((device) => (
              <DeviceCard
                key={device.id}
                configuration={
                  panel.configuration ?? {
                    snapshot: { version: 1, physicalPoints: [], logicalChannels: [] },
                    metadata: { names: {}, presets: [] },
                  }
                }
                device={device}
                live={panel.live}
                disabled={panel.busy || panel.pending}
                onEdit={() => setSelection({ kind: 'device', id: device.id })}
              />
            ))}
          </section>
          <Button
            variant="outline"
            className="wg:self-start"
            isDisabled={panel.busy || panel.pending}
            onPress={() => {
              if (!panel.configuration) return;
              const added = addDevice(panel.configuration, t('panel.newDevice'));
              setSelection({ kind: 'device', id: added.id, provisional: added.configuration });
            }}
          >
            <Plus className="wg:size-4" />
            {t('panel.addDevice')}
          </Button>
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
      <Modal.Backdrop isOpen={Boolean(panel.review)} onOpenChange={(open) => !open && panel.cancelReview()}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t('panel.flowImpactTitle')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>{t('panel.flowImpactHint', { count: panel.review?.impacts.length ?? 0 })}</p>
              <ul className="wg:mt-3 wg:flex wg:flex-col wg:gap-2">
                {panel.review?.impacts.map((impact) => (
                  <li key={impact.channelId}>
                    {panel.configuration?.metadata.names[impact.channelId] ?? impact.channelId} ·{' '}
                    {t('panel.flowReferences', { count: impact.references.length })}
                  </li>
                ))}
              </ul>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" isDisabled={panel.busy} onPress={panel.cancelReview}>
                {t('panel.cancel')}
              </Button>
              <Button isDisabled={panel.busy} onPress={panel.confirmApply}>
                {t('panel.apply')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      <Modal.Backdrop isOpen={Boolean(leave)} onOpenChange={(open) => !open && setLeave(null)}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{t('panel.leaveTitle')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>{t('panel.leaveHint')}</Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={() => setLeave(null)}>
                {t('panel.cancel')}
              </Button>
              <Button onPress={() => leave?.()}>{t('panel.leave')}</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </main>
  );
}
