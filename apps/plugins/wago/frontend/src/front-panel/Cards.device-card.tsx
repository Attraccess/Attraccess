import { Accordion, Button, Card } from '@heroui/react';
import { Settings2 } from 'lucide-react';
import { BUILTIN_MODBUS_PROFILES, type ModbusDevice, type ModbusMeasurement } from '../../../modbus/model';
import { formatMeterMeasurement } from './measurement-display';
import { useWagoTranslations } from '../i18n';
import { deviceProfile, registerChannel, type PanelConfiguration } from './model';
import type { LiveControls } from './Cards.live-controls';
import { channelSample } from './Cards.helpers';
import { OutputControl } from './Cards.helpers';

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
    channels.some((channel) => live.diagnostics?.channels.find((item) => item.id === channel.id)?.current);
  const renderMeasurement = (register: ModbusMeasurement) => {
    const channel =
      live.applied && appliedProfile?.measurements.some((item) => item.id === register.id)
        ? registerChannel(live.applied.snapshot, device.id, register.id, 'measurementId')
        : undefined;
    const sample = channelSample(live, channel?.id, 'measurement');
    return (
      <div key={register.id} className="wg:flex wg:items-baseline wg:justify-between wg:gap-3">
        <span className="wg:min-w-0 wg:break-words wg:text-sm wg:text-muted">
          {shownBuiltin ? tBackendMessage(register.name) : register.name}
        </span>
        <span className="wg:shrink-0 wg:text-lg wg:font-semibold wg:tabular-nums">
          {formatMeterMeasurement(
            register,
            typeof sample?.value === 'number' ? { value: sample.value, unit: sample.unit ?? register.unit } : undefined,
            language,
            shownBuiltin ? tBackendMessage : undefined,
          )}
        </span>
      </div>
    );
  };
  const sections = new Map<string, ModbusMeasurement[]>();
  for (const register of shownProfile?.measurements ?? []) {
    const key = register.section ?? 'electrical';
    const entries = sections.get(key) ?? [];
    entries.push(register);
    sections.set(key, entries);
  }
  return (
    <Card className={`wg:min-w-0 ${sections.size > 1 ? 'wg:md:col-span-2 wg:xl:col-span-3' : ''}`}>
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
        {appliedDevice && !online && (
          <p role="alert" className="wg:text-sm wg:text-danger">
            {t('panel.noResponse', { address: appliedDevice?.unitId ?? device.unitId })}
          </p>
        )}
        {appliedDevice && online && fault && (
          <p role="status" className="wg:text-sm wg:text-muted">
            {t('panel.partialReadings')}
          </p>
        )}
        {appliedDevice && deviceChanged && <p className="wg:text-sm wg:text-muted">{t('panel.appliedValues')}</p>}
        {!appliedDevice && <p className="wg:text-sm wg:text-muted">{t('panel.applyFirst')}</p>}
        {sections.size > 1 ? (
          <Accordion allowsMultipleExpanded defaultExpandedKeys={['electrical']}>
            {[...sections].map(([section, registers]) => (
              <Accordion.Item key={section} id={section}>
                <Accordion.Heading>
                  <Accordion.Trigger>
                    {t(`panel.sections.${section}`)}
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="wg:grid wg:grid-cols-1 wg:gap-x-8 wg:gap-y-3 wg:md:grid-cols-2 wg:xl:grid-cols-3">
                    {registers.map(renderMeasurement)}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        ) : (
          shownProfile?.measurements.map(renderMeasurement)
        )}
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
