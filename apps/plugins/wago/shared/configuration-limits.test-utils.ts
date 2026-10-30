import { BUILTIN_MODBUS_PROFILES } from '../modbus/model';
import { WAGO_879_3020_DEFAULT_ENABLED } from '../modbus/wago-879-3020';

const meterProfile = BUILTIN_MODBUS_PROFILES.find((profile) => profile.id === 'wago-879-3020');

/**
 * A valid snapshot with `meters` built-in 879-3020 meters on one bus. Every meter has one point and one
 * measurement channel per register (131). The first `enabledPerMeter` readings stay enabled, taken from
 * the editor's default-enabled set first (so the default 11 is exactly what a new meter gets) and then in
 * profile order.
 */
export function meterFleet(meters = 10, enabledPerMeter = 11) {
  if (!meterProfile) throw new Error('missing built-in 879-3020 profile');
  const devices = Array.from({ length: meters }, (_, index) => ({
    id: `meter-${index}`,
    name: `Meter ${index}`,
    connectionId: 'bus',
    unitId: index + 1,
    profileId: meterProfile.id,
    profileVersion: meterProfile.version,
  }));
  const defaults = new Set(WAGO_879_3020_DEFAULT_ENABLED);
  const enabledIds = new Set(
    [
      ...WAGO_879_3020_DEFAULT_ENABLED,
      ...meterProfile.measurements.map(({ id }) => id).filter((id) => !defaults.has(id)),
    ].slice(0, enabledPerMeter),
  );
  const readings = devices.flatMap((device) =>
    meterProfile.measurements.map((measurement) => ({ device, measurement, enabled: enabledIds.has(measurement.id) })),
  );
  return {
    version: 1 as const,
    modbus: {
      connections: [
        {
          id: 'bus',
          transport: 'tcp' as const,
          host: 'meter.invalid',
          port: 502,
          timeoutMs: 1000,
          reconnectMs: 250,
          queueLimit: 16,
        },
      ],
      devices,
      profiles: [],
    },
    physicalPoints: readings.map(({ device, measurement }) => ({
      id: `${device.id}/${measurement.id}`,
      hardwareProfile: 'modbus' as const,
      channel: 0,
      modbus: { deviceId: device.id, measurementId: measurement.id },
    })),
    logicalChannels: readings.map(({ device, measurement, enabled }) => ({
      id: `${device.id}.${measurement.id}`,
      physicalPointId: `${device.id}/${measurement.id}`,
      profile: 'generic-monitored-input' as const,
      capabilities: ['measurement' as const],
      disconnectPolicy: { mode: 'hold' as const },
      measurement: { unit: measurement.unit, scale: 1, offset: 0, kind: measurement.kind },
      ...(enabled ? {} : { enabled: false as const }),
    })),
  };
}
