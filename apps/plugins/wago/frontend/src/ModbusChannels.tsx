import { Button } from '@heroui/react';
import { findProfile, type ModbusConfiguration, type ModbusPoint } from '../../modbus/model';

export function ModbusChannels({
  configuration,
  onAdd,
}: {
  configuration: ModbusConfiguration;
  onAdd: (binding: ModbusPoint, name: string) => void;
}) {
  return (
    <section aria-label="Named Modbus points" className="wg:flex wg:flex-col wg:gap-3">
      <h3>Named Modbus points</h3>
      <p>Add a named measurement or output to make it available as a logical channel. Save and publish separately.</p>
      {configuration.devices.map((device) => {
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
                Add {measurement.name} from {device.name}
              </Button>
            ))}
            {profile?.actions.map((action) => (
              <Button
                key={action.id}
                className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
                variant="secondary"
                onPress={() => onAdd({ deviceId: device.id, actionId: action.id }, `${device.name}: ${action.name}`)}
              >
                Add {action.name} from {device.name}
              </Button>
            ))}
            {profile && !profile.actions.length && <p>This profile has no output actions.</p>}
          </section>
        );
      })}
    </section>
  );
}
