import type { ModbusMeasurement } from "./model-contracts";
import type { ModbusAction } from "./model-contracts";
import type { ModbusDevice } from "./model-contracts";
import { registerCount } from "./model.register-count";
import { wireAddress } from "./model.wire-address";

export /** Validate one logical owner against the selected profile and the shared physical address space. */
function validateChannelBinding(
  channel: {
    capabilities?: unknown;
    measurement?: { unit?: unknown; kind?: unknown; scale?: unknown; offset?: unknown };
  },
  measurement: ModbusMeasurement | undefined,
  action: ModbusAction | undefined,
  device: ModbusDevice | undefined,
  outputOwners: Set<string>,
  fail: (message: string) => void,
): void {
  const capabilities = Array.isArray(channel.capabilities) ? channel.capabilities : [];
  if (capabilities.includes('output') && action && device) {
    // Connection endpoints are unique in a valid config. Device/profile/action names
    // are aliases, while FC06 and FC16 share the same holding-register address space.
    for (let offset = 0; offset < registerCount(action); offset++) {
      const key = JSON.stringify([
        device.connectionId,
        device.unitId,
        action.functionCode === 5 ? 'coil' : 'register',
        wireAddress(action) + offset,
      ]);
      if (outputOwners.has(key)) fail('each physical Modbus output must have a single logical owner');
      outputOwners.add(key);
    }
  }
  if (capabilities.includes('input') && !capabilities.includes('measurement'))
    fail(
      measurement
        ? 'Modbus register inputs require measurement capability and its named measurement transform'
        : 'input requires named measurement',
    );
  if (capabilities.includes('output') && !action) fail('output requires named action');
  if (
    capabilities.includes('measurement') &&
    (!measurement ||
      channel.measurement?.unit !== measurement.unit ||
      (channel.measurement?.kind ?? 'live') !== measurement.kind ||
      channel.measurement?.scale !== 1 ||
      channel.measurement?.offset !== 0)
  )
    fail('measurement channel must match profile unit/kind with identity transform');
}
