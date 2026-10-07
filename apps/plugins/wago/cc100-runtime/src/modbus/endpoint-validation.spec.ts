import { validateSnapshot as validateBackend } from '../../../backend/configuration';
import { validateSnapshot as validateRuntime } from '../runtime';

import { QueuedModbusTransport } from './transports';
import { readPdu, writePdu } from './protocol';

import { snapshot } from './review-regressions.test-utils';
describe('ATT-1059 independent review regressions', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it.each(['/dev/ttyS0', '/dev/serial/by-id/fixture.0'])('accepts canonical RTU path %s at both boundaries', (path) => {
    const s = snapshot();
    const connection = s.modbus.connections[0];
    if (connection.transport !== 'rtu') throw new Error('Fixture requires RTU');
    connection.path = path;
    expect(validateBackend(s)).toEqual([]);
    expect(validateRuntime(s)).toEqual([]);
  });

  it.each(['/dev/./ttyS0', '/dev//ttyS0', '/dev/ttyS0/', '/dev/sub/../ttyS0'])(
    'rejects noncanonical RTU path %s at both boundaries',
    (path) => {
      const s = snapshot();
      const connection = s.modbus.connections[0];
      if (connection.transport !== 'rtu') throw new Error('Fixture requires RTU');
      connection.path = path;
      for (const validate of [validateBackend, validateRuntime]) {
        expect(validate(s)).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: 'modbus.connections[0]', code: 'invalid_modbus' })]),
        );
      }
    },
  );

  it.each(['path', 'host', 'port'])('rejects non-coercible endpoint %s at both boundaries', (field) => {
    const s = snapshot();
    if (field !== 'path') {
      Object.assign(s.modbus.connections[0], { transport: 'tcp', host: 'fixture.invalid', port: 502 });
    }
    Object.assign(s.modbus.connections[0], { [field]: { toString: null } });
    for (const validate of [validateBackend, validateRuntime]) {
      expect(validate(s)).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'modbus.connections[0]', code: 'invalid_modbus' })]),
      );
    }
  });

  it.each(['.', '', 'sub/..', 'trailing'])(
    'shares RTU quarantine with directly constructed lexical alias %p',
    async (segment) => {
      for (const aliasFirst of [false, true]) {
        const s = snapshot();
        const c = s.modbus.connections[0];
        if (c.transport !== 'rtu') throw new Error('Fixture requires RTU');
        const exchange = jest.fn(async () => {
          throw new Error('ambiguous serial failure');
        });
        const pdu = readPdu(3, s.modbus.profiles[0].measurements[0]);
        const alias = {
          ...c,
          path: segment === 'trailing' ? `${c.path}/` : c.path.replace('/dev/', `/dev/${segment}/`),
        };
        await expect(new QueuedModbusTransport(aliasFirst ? alias : c, exchange).request(1, pdu)).rejects.toThrow();
        await expect(new QueuedModbusTransport(aliasFirst ? c : alias, exchange).request(1, pdu)).rejects.toMatchObject(
          {
            code: 'modbus_rtu_quarantined',
          },
        );
        expect(exchange).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([null, true, false, [], [0], '', '0', '12', 1.5])(
    'rejects malformed source addresses %p through both boundaries',
    (address) => {
      for (const entry of ['measurements', 'actions'] as const) {
        const s = snapshot();
        const profile = s.modbus.profiles[0];
        Object.assign(profile[entry][0], { address });
        expect(validateBackend(s).length).toBeGreaterThan(0);
        expect(validateRuntime(s).length).toBeGreaterThan(0);
        if (entry === 'measurements') expect(() => readPdu(3, profile.measurements[0])).toThrow('address');
        else expect(() => writePdu(6, profile.actions[0], 1)).toThrow('address');
      }
    },
  );

  it.each([null, {}, true, 1, 'measurement'])('rejects malformed capabilities %p without throwing', (capabilities) => {
    const s = snapshot();
    Object.assign(s.logicalChannels[0], { capabilities });
    expect(validateBackend(s).length).toBeGreaterThan(0);
    expect(validateRuntime(s).length).toBeGreaterThan(0);
  });

  it('rejects input channels bound only to an action at both boundaries', () => {
    const s = snapshot();
    delete s.physicalPoints[0].modbus.measurementId;
    s.logicalChannels[0].capabilities = ['input'];
    Reflect.deleteProperty(s.logicalChannels[0], 'measurement');
    delete s.logicalChannels[0].measurement;
    for (const validate of [validateBackend, validateRuntime])
      expect(validate(s)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'invalid_modbus_binding', message: 'input requires named measurement' }),
        ]),
      );
  });
});
