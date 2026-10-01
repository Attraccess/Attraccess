import { Button } from '@heroui/react';
import { findProfile, type ModbusConfiguration, type ModbusPoint } from '../../modbus/model';

import { useWagoTranslations } from './i18n';
import { modbusDisplayName } from './modbus-labels';

export function ModbusChannels({
  configuration,
  onAdd,
  deviceId,
}: {
  configuration: ModbusConfiguration;
  deviceId?: string;
  onAdd: (binding: ModbusPoint, name: string) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
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
              {profile?.measurements.map((measurement) => (
                <Button
                  key={measurement.id}
                  className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
                  variant="secondary"
                  onPress={() =>
                    onAdd({ deviceId: device.id, measurementId: measurement.id }, `${device.name}: ${measurement.name}`)
                  }
                >
                  {t('modbus.addPoint', {
                    name: modbusDisplayName(profile, measurement.name, tBackendMessage),
                    device: device.name,
                  })}
                </Button>
              ))}
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
