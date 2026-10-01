// Displays physical terminals and Modbus registers with current controller telemetry.
// FEATURE: WAGO front panel controls always use the applied configuration.
import { Button, Card, Switch } from '@heroui/react';
import { Cable, Settings2, Zap } from 'lucide-react';
import { DIGITAL_TERMINALS } from '../../../backend/configuration-digital';
import { outputBehavior } from '../../../channel-behavior';
import type { WagoDiagnostics } from '../../../diagnostics-types';
import { BUILTIN_MODBUS_PROFILES, type ModbusDevice } from '../../../modbus/model';
import { useWagoTranslations } from '../i18n';
import {
  busConnection,
  deviceProfile,
  registerChannel,
  terminalChannel,
  terminalName,
  type Channel,
  type PanelConfiguration,
  type Terminal,
} from './model';

export interface LiveControls {
  applied: PanelConfiguration | null;
  diagnostics?: WagoDiagnostics;
  busy: boolean;
  enabled: boolean;
  command: (channel: Channel, value?: boolean) => void;
}

export function channelSample(live: LiveControls, id: string | undefined, kind: 'input' | 'output' | 'measurement') {
  return live.diagnostics?.channels
    .find((channel) => channel.id === id)
    ?.samples.find((sample) => sample.kind === kind && sample.current);
}

export function OutputControl({ live, channel, label }: { live: LiveControls; channel?: Channel; label: string }) {
  const { t } = useWagoTranslations();
  const sample = channelSample(live, channel?.id, 'output');
  const disabled = !channel || !live.enabled || live.busy;
  return outputBehavior(channel ?? { capabilities: [] }) === 'pulsed' ? (
    <Button
      size="sm"
      variant="secondary"
      isDisabled={disabled}
      aria-label={t('panel.pulseOutput', { name: label })}
      onPress={() => channel && live.command(channel)}
    >
      <Zap className="wg:size-4" />
      {t('panel.pulse')}
    </Button>
  ) : (
    <Switch
      aria-label={t('panel.switchOutput', { name: label })}
      isSelected={sample?.value === true}
      isDisabled={disabled || !sample}
      onChange={(value) => channel && live.command(channel, value)}
    >
      <Switch.Content aria-label={t('panel.switchOutput', { name: label })}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

export function OnboardCard({
  configuration,
  live,
  disabled,
  editTerminal,
  editBus,
}: {
  configuration: PanelConfiguration;
  live: LiveControls;
  disabled: boolean;
  editTerminal: (terminal: Terminal) => void;
  editBus: () => void;
}) {
  const { t, language } = useWagoTranslations();
  const bus = busConnection(configuration.snapshot);
  return (
    <Card className="wg:min-w-0">
      <Card.Header className="wg:flex wg:flex-row wg:flex-wrap wg:items-start wg:justify-between wg:gap-3">
        <div>
          <Card.Title>{t('panel.onboard')}</Card.Title>
          <Card.Description>{t('panel.terminalHint')}</Card.Description>
        </div>
        <Button variant="ghost" size="sm" isDisabled={disabled} onPress={editBus}>
          <Cable className="wg:size-4" />
          {t('panel.busSummary', {
            baud: bus.transport === 'rtu' ? bus.baudRate : 9600,
            parity: bus.transport === 'rtu' ? { none: 'N', even: 'E', odd: 'O' }[bus.parity] : 'E',
            bits: bus.transport === 'rtu' ? bus.stopBits : 1,
          })}
        </Button>
      </Card.Header>
      <Card.Content className="wg:grid wg:grid-cols-1 wg:gap-6 wg:lg:grid-cols-2">
        <section aria-label={t('panel.outputs')}>
          <h2 className="wg:mb-3 wg:text-sm wg:font-medium wg:text-muted">{t('panel.outputs')}</h2>
          <div className="wg:grid wg:grid-cols-2 wg:gap-3">
            {DIGITAL_TERMINALS.filter((terminal) => terminal.direction === 'output').map((terminal) => {
              const channel = terminalChannel(configuration.snapshot, terminal);
              const name = terminalName(configuration, terminal);
              const applied = live.applied && terminalChannel(live.applied.snapshot, terminal);
              const appliedName = live.applied ? terminalName(live.applied, terminal) : '';
              const manual = applied && live.diagnostics?.manualOutputChannelIds?.includes(applied.id);
              return (
                <div
                  key={terminal.label}
                  className={`wg:relative wg:flex wg:min-h-36 wg:min-w-0 wg:flex-col wg:gap-3 wg:rounded-xl wg:border wg:border-border wg:bg-surface-secondary wg:p-4 ${name ? '' : 'wg:opacity-55'}`}
                >
                  <Button
                    variant="ghost"
                    aria-label={t('panel.configure', { name: `${terminal.label} ${name}` })}
                    className="wg:absolute wg:inset-0 wg:h-full wg:w-full wg:items-start wg:justify-end wg:rounded-xl wg:p-3"
                    isDisabled={disabled}
                    onPress={() => editTerminal(terminal)}
                  >
                    <Settings2 className="wg:absolute wg:top-3 wg:right-3 wg:size-4" />
                  </Button>
                  <div className="wg:pointer-events-none wg:flex wg:items-center wg:justify-between wg:gap-2 wg:pr-7">
                    <span className="wg:text-xs wg:font-semibold">{terminal.label}</span>
                    {appliedName && (
                      <div className="wg:pointer-events-auto wg:relative">
                        <OutputControl live={live} channel={applied} label={`${terminal.label} ${appliedName}`} />
                      </div>
                    )}
                  </div>
                  <p className="wg:pointer-events-none wg:break-words wg:font-medium">{name || t('panel.unused')}</p>
                  <p className="wg:pointer-events-none wg:mt-auto wg:text-xs wg:text-muted">
                    {outputBehavior(applied || channel || { capabilities: [] }) === 'pulsed'
                      ? t('panel.pulseSummary', {
                          seconds: new Intl.NumberFormat(language).format(
                            ((applied || channel)?.pulse?.durationMs ?? 0) / 1000,
                          ),
                        })
                      : t('panel.switched')}{' '}
                    · {t(manual ? 'panel.manual' : 'panel.flow')}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        <section aria-label={t('panel.inputs')}>
          <h2 className="wg:mb-3 wg:text-sm wg:font-medium wg:text-muted">{t('panel.inputs')}</h2>
          <div className="wg:grid wg:grid-cols-1 wg:gap-2 wg:sm:grid-cols-2">
            {DIGITAL_TERMINALS.filter((terminal) => terminal.direction === 'input').map((terminal) => {
              const name = terminalName(configuration, terminal);
              const channel = live.applied && terminalChannel(live.applied.snapshot, terminal);
              const sample = channelSample(live, channel?.id, 'input');
              return (
                <Button
                  key={terminal.label}
                  variant="ghost"
                  isDisabled={disabled}
                  aria-label={t('panel.configure', { name: `${terminal.label} ${name}` })}
                  onPress={() => editTerminal(terminal)}
                  className={`wg:h-auto wg:min-h-12 wg:w-full wg:min-w-0 wg:justify-start wg:gap-2 wg:rounded-lg wg:bg-surface-secondary wg:px-3 wg:py-3 wg:whitespace-normal ${name ? '' : 'wg:opacity-55'}`}
                >
                  <span
                    aria-label={t(sample ? (sample.value ? 'panel.on' : 'panel.off') : 'panel.unknown')}
                    className={`wg:size-2.5 wg:shrink-0 wg:rounded-full ${sample ? (sample.value ? 'wg:bg-success' : 'wg:bg-muted') : 'wg:border wg:border-muted'}`}
                  />
                  <span className="wg:shrink-0 wg:text-xs wg:text-muted">{terminal.label}</span>
                  <span className="wg:min-w-0 wg:flex-1 wg:break-words wg:text-left wg:text-sm">
                    {name || t('panel.unused')}
                  </span>
                  <Settings2 className="wg:size-4 wg:shrink-0 wg:text-muted" />
                </Button>
              );
            })}
          </div>
        </section>
      </Card.Content>
    </Card>
  );
}

export function DeviceCard({
  configuration,
  device,
  live,
  disabled,
  onEdit,
}: {
  configuration: PanelConfiguration;
  device: ModbusDevice;
  live: LiveControls;
  disabled: boolean;
  onEdit: () => void;
}) {
  const { t, tBackendMessage, language } = useWagoTranslations();
  const profile = deviceProfile(configuration, device);
  const builtin = BUILTIN_MODBUS_PROFILES.some((item) => item.id === profile?.id);
  const connection = configuration.snapshot.modbus?.connections.find((item) => item.id === device.connectionId);
  const appliedDevice = live.applied?.snapshot.modbus?.devices.find((item) => item.id === device.id);
  const appliedProfile = live.applied && appliedDevice && deviceProfile(live.applied, appliedDevice);
  const ids =
    live.applied?.snapshot.physicalPoints
      .filter((point) => point.modbus?.deviceId === device.id)
      .map((point) => point.id) ?? [];
  const channels =
    live.applied?.snapshot.logicalChannels.filter((channel) => ids.includes(channel.physicalPointId)) ?? [];
  const shownProfile = appliedProfile || profile;
  const shownBuiltin = BUILTIN_MODBUS_PROFILES.some((item) => item.id === shownProfile?.id);
  const appliedConnection = live.applied?.snapshot.modbus?.connections.find(
    (item) => item.id === appliedDevice?.connectionId,
  );
  const deviceChanged =
    JSON.stringify([device, connection, profile]) !==
    JSON.stringify([appliedDevice, appliedConnection, appliedProfile]);
  const fault = live.diagnostics?.channels.find(
    (channel) => channels.some((item) => item.id === channel.id) && channel.fault,
  )?.fault;
  const online =
    live.diagnostics?.connectivity === 'online' &&
    !fault &&
    channels.some((channel) => live.diagnostics?.channels.find((item) => item.id === channel.id)?.current);
  return (
    <Card className="wg:min-w-0">
      <Card.Header className="wg:flex wg:flex-row wg:items-start wg:justify-between wg:gap-2">
        <div className="wg:min-w-0 wg:flex-1">
          <Card.Title className="wg:flex wg:items-center wg:gap-2">
            <span
              aria-label={t(online ? 'panel.online' : 'panel.offline')}
              className={`wg:size-2.5 wg:shrink-0 wg:rounded-full ${online ? 'wg:bg-success' : fault ? 'wg:bg-danger' : 'wg:bg-muted'}`}
            />
            <span className="wg:min-w-0 wg:break-words">{device.name}</span>
          </Card.Title>
          <Card.Description className="wg:mt-1 wg:break-words">
            {profile ? (builtin ? tBackendMessage(profile.name) : profile.name) : t('panel.unknownProfile')} ·{' '}
            {connection?.transport === 'tcp'
              ? t('panel.tcpSummary', { host: connection.host, port: connection.port, unit: device.unitId })
              : t('panel.rtuSummary', { address: device.unitId })}
          </Card.Description>
        </div>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          className="wg:shrink-0"
          isDisabled={disabled}
          aria-label={t('panel.configure', { name: device.name })}
          onPress={onEdit}
        >
          <Settings2 className="wg:size-4" />
        </Button>
      </Card.Header>
      <Card.Content className="wg:flex wg:flex-col wg:gap-3">
        {appliedDevice && (!online || fault) && (
          <p role="alert" className="wg:text-sm wg:text-danger">
            {t('panel.noResponse', { address: appliedDevice?.unitId ?? device.unitId })}
          </p>
        )}
        {appliedDevice && deviceChanged && <p className="wg:text-sm wg:text-muted">{t('panel.appliedValues')}</p>}
        {!appliedDevice && <p className="wg:text-sm wg:text-muted">{t('panel.applyFirst')}</p>}
        {shownProfile?.measurements.map((register) => {
          const channel =
            live.applied && appliedProfile?.measurements.some((item) => item.id === register.id)
              ? registerChannel(live.applied.snapshot, device.id, register.id, 'measurementId')
              : undefined;
          const sample = channelSample(live, channel?.id, 'measurement');
          const value = typeof sample?.value === 'number' ? sample.value : undefined;
          const unit = sample?.unit ?? register.unit;
          const milli = unit.startsWith('milli');
          const canonical = milli ? unit.slice(5) : unit;
          const number = value === undefined ? undefined : value / (milli ? 1000 : 1);
          const kilo = number !== undefined && ['watt', 'watt-hour'].includes(canonical) && Math.abs(number) >= 1000;
          const symbols: Record<string, string> = {
            watt: 'W',
            'watt-hour': 'Wh',
            volt: 'V',
            ampere: 'A',
            percent: '%',
          };
          return (
            <div key={register.id} className="wg:flex wg:items-baseline wg:justify-between wg:gap-3">
              <span className="wg:min-w-0 wg:break-words wg:text-sm wg:text-muted">
                {shownBuiltin ? tBackendMessage(register.name) : register.name}
              </span>
              <span className="wg:shrink-0 wg:text-lg wg:font-semibold wg:tabular-nums">
                {number === undefined
                  ? '—'
                  : `${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(number / (kilo ? 1000 : 1))} ${kilo ? 'k' : ''}${symbols[canonical] ?? canonical}`}
              </span>
            </div>
          );
        })}
        {shownProfile?.actions.map((register) => {
          const channel =
            live.applied && appliedProfile?.actions.some((item) => item.id === register.id)
              ? registerChannel(live.applied.snapshot, device.id, register.id, 'actionId')
              : undefined;
          return (
            <div key={register.id} className="wg:flex wg:items-center wg:justify-between wg:gap-3">
              <span className="wg:min-w-0 wg:break-words wg:text-sm">{register.name}</span>
              <OutputControl live={live} channel={channel || undefined} label={`${device.name} ${register.name}`} />
            </div>
          );
        })}
      </Card.Content>
    </Card>
  );
}
