import { Button } from '@heroui/react';
import { useId } from 'react';
import { findProfile, type ModbusConfiguration, type ModbusPoint } from '../../../../modbus/model';
import type { WagoConfigurationSnapshot } from '../../api/client';

import { useWagoTranslations } from '../../i18n';
import { modbusDisplayName } from '../modbus/modbus-labels';

export function ModbusChannels({
  configuration,
  onAdd,
  deviceId,
  snapshot,
}: {
  configuration: ModbusConfiguration;
  deviceId?: string;
  /** Marks readings whose channels are all disabled. */
  snapshot?: Pick<WagoConfigurationSnapshot, 'physicalPoints' | 'logicalChannels'>;
  onAdd: (binding: ModbusPoint, name: string) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const idBase = useId();
  const pointBinding = new Map(
    (snapshot?.physicalPoints ?? []).flatMap((point) =>
      point.modbus?.measurementId && point.modbus.actionId === undefined
        ? [[point.id, `${point.modbus.deviceId}\u0000${point.modbus.measurementId}`] as const]
        : [],
    ),
  );
  const readingState = new Map<string, boolean>();
  for (const channel of snapshot?.logicalChannels ?? []) {
    const key = pointBinding.get(channel.physicalPointId);
    if (key) readingState.set(key, Boolean(readingState.get(key)) || channel.enabled !== false);
  }
  const disabled = (device: string, measurement: string) => readingState.get(`${device}\u0000${measurement}`) === false;
  return (
    <section aria-label={t('modbus.points')} className="wg:flex wg:flex-col wg:gap-3">
      <h3>{t('modbus.points')}</h3>
      <p>{t('modbus.pointsDescription')}</p>
      {configuration.devices
        .filter((device) => !deviceId || device.id === deviceId)
        .map((device) => {
          const profile = findProfile(configuration, device);
          return (
            <section key={device.id} className="wg:flex wg:flex-col wg:gap-2">
              <h4>{device.name}</h4>
              {profile?.measurements.map((measurement, index) => {
                // A second channel for a disabled reading would be polled while the first stays off; the
                // operator enables the existing channel instead.
                const off = disabled(device.id, measurement.id);
                const hintId = `${idBase}-${device.id}-${index}`;
                return (
                  <div key={measurement.id} className="wg:flex wg:flex-col wg:gap-1">
                    <Button
                      className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
                      variant="secondary"
                      isDisabled={off}
                      aria-describedby={off ? hintId : undefined}
                      onPress={() =>
                        onAdd(
                          { deviceId: device.id, measurementId: measurement.id },
                          `${device.name}: ${measurement.name}`,
                        )
                      }
                    >
                      {t('modbus.addPoint', {
                        name: modbusDisplayName(profile, measurement.name, tBackendMessage),
                        device: device.name,
                      })}
                    </Button>
                    {off && (
                      <p id={hintId} className="wg:text-sm wg:text-muted">
                        {t('modbus.pointDisabled')}
                      </p>
                    )}
                  </div>
                );
              })}
              {profile?.actions.map((action) => (
                <Button
                  key={action.id}
                  className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
                  variant="secondary"
                  onPress={() => onAdd({ deviceId: device.id, actionId: action.id }, `${device.name}: ${action.name}`)}
                >
                  {t('modbus.addPoint', {
                    name: modbusDisplayName(profile, action.name, tBackendMessage),
                    device: device.name,
                  })}
                </Button>
              ))}
              {profile && !profile.actions.length && <p>{t('modbus.noActions')}</p>}
            </section>
          );
        })}
    </section>
  );
}
