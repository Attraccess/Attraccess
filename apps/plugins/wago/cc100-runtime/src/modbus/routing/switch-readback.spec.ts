import { type ModbusAction } from '../../../../modbus/model';
import { ModbusDeviceRouter } from './adapter';
import { encode, readPdu } from '../protocol/protocol';

import { serial } from './routing.test-utils';
describe('Modbus switch readback', () => {
  const action = {
    id: 'switch',
    name: 'Switch',
    functionCode: 6 as const,
    address: 12,
    addressBase: 1 as const,
    dataType: 'uint16' as const,
    byteOrder: 'big' as const,
    wordOrder: 'big' as const,
    scale: 2,
    offset: 3,
    onValue: 5,
    offValue: 3,
  };
  const point = {
    id: 'switch-point',
    hardwareProfile: 'modbus' as const,
    channel: 0,
    modbus: { deviceId: 'relay', actionId: 'switch' },
  };
  function routerFor(register: ModbusAction, request: jest.Mock) {
    const router = new ModbusDeviceRouter({ read: async () => false, write: async () => undefined }, () => ({
      request,
    }));
    router.configure({
      version: 1,
      physicalPoints: [point],
      logicalChannels: [],
      modbus: {
        connections: [serial],
        devices: [
          {
            id: 'relay',
            name: 'Relay',
            connectionId: serial.id,
            unitId: 7,
            profileId: 'relay-profile',
            profileVersion: 1,
            pollIntervalMs: 1000,
          },
        ],
        profiles: [{ id: 'relay-profile', name: 'Relay', version: 1, measurements: [], actions: [register] }],
      },
    });
    return router;
  }
  it.each([5, 6, 16] as const)(
    'reads physical FC%s switches and invalidates readback after a command',
    async (functionCode) => {
      const register = {
        ...action,
        functionCode,
        ...(functionCode === 5 ? { scale: 1, offset: 0, onValue: 1, offValue: 0 } : {}),
      };
      let actual = true;
      const request = jest.fn(async (_unit: number, pdu: Buffer) => {
        if ([1, 3].includes(pdu[0]))
          return functionCode === 5
            ? Buffer.from([Number(actual)])
            : encode(actual ? register.onValue : register.offValue, register);
        return pdu.subarray(0, 5);
      });
      const router = routerFor(register, request);
      expect(await router.readOutput(point)).toBe(true);
      expect(request.mock.calls[0][1]).toEqual(readPdu(functionCode === 5 ? 1 : 3, register));
      expect(await router.readOutput(point)).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
      await router.write(point, true);
      actual = false; // A command acknowledgement is not a physical state reading.
      expect(await router.readOutput(point)).toBe(false);
      expect(request).toHaveBeenCalledTimes(3);
    },
  );
  it('limits failed read retries to the configured interval', async () => {
    const request = jest.fn().mockRejectedValue(new Error('No response'));
    const router = routerFor(action, request);
    await expect(router.readOutput(point)).rejects.toThrow('No response');
    await expect(router.readOutput(point)).rejects.toThrow('No response');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('fails closed when distinct switch values collapse to the same float32 representation', async () => {
    const register = {
      ...action,
      functionCode: 16 as const,
      dataType: 'float32' as const,
      scale: 1,
      offset: 0,
      onValue: 0.1,
      offValue: 0.1000000001,
    };
    const request = jest.fn(async () => encode(register.offValue, register));
    const router = routerFor(register, request);
    await expect(router.readOutput(point)).rejects.toThrow('indistinguishable on/off values');
  });
  it.each(['big', 'little'] as const)(
    'recognizes encoded float32 switch values with %s word order',
    async (wordOrder) => {
      const register = {
        ...action,
        functionCode: 16 as const,
        dataType: 'float32' as const,
        wordOrder,
        scale: 2,
        offset: 3,
        onValue: 3.2,
        offValue: 3.4,
      };
      let actual = register.onValue;
      const request = jest.fn(async (_unit: number, pdu: Buffer) =>
        pdu[0] === 3 ? encode(actual, register) : pdu.subarray(0, 5),
      );
      const router = routerFor(register, request);
      expect(await router.readOutput(point)).toBe(true);
      await router.write(point, false);
      actual = register.offValue;
      expect(await router.readOutput(point)).toBe(false);
      await router.write(point, true);
      actual = 4;
      await expect(router.readOutput(point)).rejects.toThrow('unknown state');
    },
  );
});
