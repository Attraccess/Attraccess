import { createServer, type Server, type Socket } from 'node:net';
// The fixture exercises the same pure configuration model as the plugin.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  BUILTIN_MODBUS_PROFILES,
  duplicateProfile,
  type ModbusConfiguration,
  type ModbusConnection,
  validateModbus,
} from '../../../modbus/model';
import { CumulativeCounter, ModbusDeviceRouter } from './adapter';
import { crc16, decodeRaw, encode, readPdu, rtuFrame, writePdu } from './protocol';
import { QueuedModbusTransport } from './transports';

const format = {
  address: 12,
  addressBase: 1 as const,
  dataType: 'uint32' as const,
  byteOrder: 'big' as const,
  wordOrder: 'big' as const,
  scale: 1,
  offset: 0,
};
const serial: ModbusConnection = {
  id: 'bus',
  transport: 'rtu',
  path: '/dev/serial',
  baudRate: 19200,
  parity: 'even',
  stopBits: 1,
  timeoutMs: 50,
  reconnectMs: 0,
  queueLimit: 2,
};
describe('Modbus protocol fixtures (no hardware)', () => {
  let busNumber = 0;
  beforeEach(() => {
    serial.path = `/dev/fixture-protocol-${++busNumber}`;
  });
  let server: Server;
  const sockets = new Set<Socket>();
  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  async function fixture(reply: (request: Buffer, socket: Socket) => void) {
    server = createServer((socket) => {
      sockets.add(socket);
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= 7 && buffer.length >= buffer.readUInt16BE(4) + 6) reply(buffer, socket);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fixture address');
    return new QueuedModbusTransport({
      id: 'tcp',
      transport: 'tcp',
      host: '127.0.0.1',
      port: address.port,
      timeoutMs: 100,
      reconnectMs: 5,
      queueLimit: 2,
    });
  }
  function response(request: Buffer, pdu: Buffer) {
    const h = Buffer.from(request.subarray(0, 7));
    h.writeUInt16BE(pdu.length + 1, 4);
    return Buffer.concat([h, pdu]);
  }
  it('reads fragmented FC03/04 responses with transaction and multiple unit routing', async () => {
    const units: number[] = [];
    const transport = await fixture((request, socket) => {
      units.push(request[6]);
      const r = response(request, Buffer.from([request[7], 4, 0, 0, 0, request[6]]));
      socket.write(r.subarray(0, 5));
      setTimeout(() => socket.end(r.subarray(5)), 2);
    });
    const values = await Promise.all([
      transport.request(1, readPdu(3, format)),
      transport.request(7, readPdu(4, format)),
    ]);
    expect(values.map((b) => decodeRaw(b, format))).toEqual([1, 7]);
    expect(units).toEqual([1, 7]);
  });
  it.each(['transaction', 'protocol', 'unit', 'function', 'count', 'length'])(
    'rejects corrupt TCP %s',
    async (field) => {
      const transport = await fixture((request, socket) => {
        const r = response(request, Buffer.from([3, 4, 0, 0, 0, 1]));
        if (field === 'transaction') r[1] ^= 1;
        if (field === 'protocol') r[3] = 1;
        if (field === 'unit') r[6] = 9;
        if (field === 'function') r[7] = 4;
        if (field === 'count') r[8] = 2;
        if (field === 'length') r.writeUInt16BE(255, 4);
        socket.end(r);
      });
      await expect(transport.request(1, readPdu(3, format))).rejects.toThrow();
    },
  );
  it('reports protocol exceptions then reconnects for next request', async () => {
    let calls = 0;
    const transport = await fixture((request, socket) =>
      socket.end(response(request, ++calls === 1 ? Buffer.from([0x83, 2]) : Buffer.from([3, 4, 0, 0, 0, 9]))),
    );
    await expect(transport.request(1, readPdu(3, format))).rejects.toThrow('exception 2');
    await expect(transport.request(1, readPdu(3, format))).resolves.toEqual(Buffer.from([0, 0, 0, 9]));
  });
  it('bounds a stalled queue and reconnects after timeout without replay', async () => {
    let calls = 0;
    const transport = await fixture((request, socket) => {
      if (++calls > 1) socket.end(response(request, Buffer.from([3, 4, 0, 0, 0, 1])));
    });
    const first = transport.request(1, readPdu(3, format));
    const second = transport.request(2, readPdu(3, format));
    await expect(transport.request(3, readPdu(3, format))).rejects.toThrow('queue full');
    await expect(first).rejects.toThrow('timeout');
    await expect(second).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
  it.each([5, 6, 16] as const)('validates FC%s write echo', async (fc) => {
    let corrupt = false;
    const transport = await fixture((request, socket) => {
      const echo = Buffer.from(request.subarray(7, 12));
      if (corrupt) echo[4] ^= 1;
      socket.end(response(request, echo));
    });
    const f = { ...format, dataType: fc === 16 ? ('uint32' as const) : ('uint16' as const) };
    const pdu = writePdu(fc, f, 1);
    await expect(transport.request(1, pdu)).resolves.toBeDefined();
    corrupt = true;
    await expect(transport.request(1, pdu)).rejects.toThrow('echo');
  });
  it('uses full RTU CRC frames, unit ID, and exception validation', async () => {
    expect(crc16(Buffer.from('01030000000a', 'hex'))).toBe(0xcdc5);
    const exchange = jest.fn(async (_c, request: Buffer) => {
      expect(crc16(request.subarray(0, -2))).toBe(request.readUInt16LE(request.length - 2));
      return rtuFrame(request[0], Buffer.from([3, 4, 0, 0, 0, 8]));
    });
    const transport = new QueuedModbusTransport(serial, exchange);
    await expect(transport.request(17, readPdu(3, format))).resolves.toEqual(Buffer.from([0, 0, 0, 8]));
    const bad = new QueuedModbusTransport({ ...serial, path: `${serial.path}-crc` }, async () => {
      const r = rtuFrame(17, Buffer.from([3, 4, 0, 0, 0, 8]));
      r[4] ^= 1;
      return r;
    });
    await expect(bad.request(17, readPdu(3, format))).rejects.toThrow('CRC');
    await expect(
      new QueuedModbusTransport({ ...serial, path: `${serial.path}-unit` }, async () =>
        rtuFrame(18, Buffer.from([3, 4, 0, 0, 0, 8])),
      ).request(17, readPdu(3, format)),
    ).rejects.toThrow('unit');
    await expect(
      new QueuedModbusTransport(serial, async () => rtuFrame(17, Buffer.from([0x83, 3]))).request(
        17,
        readPdu(3, format),
      ),
    ).rejects.toThrow('exception 3');
  });
  it.each([5, 6, 16] as const)('RTU write FC%s checks echoed address/value/count', async (fc) => {
    const f = { ...format, dataType: 'uint16' as const };
    const pdu = writePdu(fc, f, 1);
    const transport = new QueuedModbusTransport(serial, async (_c, r) => rtuFrame(r[0], r.subarray(1, 6)));
    await expect(transport.request(3, pdu)).resolves.toEqual(pdu.subarray(0, 5));
  });
  it('times out injected serial fixtures and bounds acquisition', async () => {
    const transport = new QueuedModbusTransport(serial, () => new Promise(() => undefined));
    await expect(transport.request(1, readPdu(3, format))).rejects.toThrow('timed out');
  });
  it('RTU serializes multiple units and replacement transports on the same bus', async () => {
    let active = 0;
    let maximum = 0;
    const units: number[] = [];
    const exchange = async (_c: ModbusConnection, r: Buffer) => {
      active++;
      maximum = Math.max(maximum, active);
      units.push(r[0]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return rtuFrame(r[0], Buffer.from([3, 4, 0, 0, 0, r[0]]));
    };
    const first = new QueuedModbusTransport(serial, exchange);
    const replacement = new QueuedModbusTransport(serial, exchange);
    const a = first.request(1, readPdu(3, format));
    const b = replacement.request(2, readPdu(3, format));
    await expect(replacement.request(3, readPdu(3, format))).rejects.toThrow('queue full');
    await Promise.all([a, b]);
    expect(maximum).toBe(1);
    expect(units).toEqual([1, 2]);
  });
  it('RTU rejects malformed requests before exchange and recovers after exceptions without write replay', async () => {
    let calls = 0;
    const transport = new QueuedModbusTransport(serial, async (_c, r) => {
      calls++;
      if (calls === 1) return rtuFrame(r[0], Buffer.from([0x85, 4]));
      return rtuFrame(r[0], r.subarray(1, 6));
    });
    await expect(transport.request(0, readPdu(3, format))).rejects.toThrow('unit');
    await expect(transport.request(1, Buffer.from([1, 0, 0, 0, 1]))).rejects.toThrow('function');
    await expect(transport.request(1, Buffer.from([3, 0, 0, 0, 0]))).rejects.toThrow('quantity');
    expect(calls).toBe(0);
    const request = writePdu(5, { ...format, dataType: 'uint16' }, 1);
    await expect(transport.request(1, request)).rejects.toThrow('exception 4');
    await expect(transport.request(2, request)).resolves.toEqual(request);
    expect(calls).toBe(2);
  });
  it('RTU discards queued writes from a superseded configuration', async () => {
    let release: (response: Buffer) => void = () => undefined;
    const exchange = jest.fn(
      () =>
        new Promise<Buffer>((resolve) => {
          release = resolve;
        }),
    );
    const transport = new QueuedModbusTransport(serial, exchange);
    let current = true;
    const reading = transport.request(1, readPdu(3, format));
    const writing = transport.request(2, writePdu(5, { ...format, dataType: 'uint16' }, 1), () => current);
    await Promise.resolve();
    current = false;
    release(rtuFrame(1, Buffer.from([3, 4, 0, 0, 0, 1])));
    await reading;
    await expect(writing).rejects.toThrow('configuration changed');
    expect(exchange).toHaveBeenCalledTimes(1);
  });
  it.each(['uint16', 'int16', 'uint32', 'int32', 'float32'] as const)(
    'round trips %s byte and word order with physical scaling',
    (dataType) => {
      for (const byteOrder of ['big', 'little'] as const)
        for (const wordOrder of ['big', 'little'] as const) {
          const f = { ...format, dataType, byteOrder, wordOrder, scale: 0.5, offset: 7 };
          expect(decodeRaw(encode(1234.5, f), f) * f.scale + f.offset).toBe(1234.5);
          expect(readPdu(3, f).readUInt16BE(1)).toBe(11);
        }
    },
  );
  it('does not infer rollover; recognizes only explicit boundary crossing', () => {
    const counter = new CumulativeCounter();
    expect(counter.update(95, 100)).toBe(95);
    expect(counter.update(3, 100)).toBe(103);
    expect(counter.update(7, 100)).toBe(107);
    expect(() => counter.update(0, 100)).toThrow('reset');
    const unknown = new CumulativeCounter();
    unknown.update(99);
    expect(() => unknown.update(1)).toThrow('without documented');
  });
  it('validates profiles and routes named measurements/actions, bounded duplicate acquisition', async () => {
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[1], 'custom');
    const config: ModbusConfiguration = {
      connections: [serial],
      profiles: [profile],
      devices: [{ id: 'meter', name: 'Meter', connectionId: 'bus', unitId: 7, profileId: 'custom', profileVersion: 1 }],
    };
    expect(validateModbus(config)).toEqual([]);
    let release: (b: Buffer) => void = () => undefined;
    const transport = {
      request: jest.fn(
        () =>
          new Promise<Buffer>((resolve) => {
            release = resolve;
          }),
      ),
    };
    const onboard = { read: jest.fn(), write: jest.fn() };
    const router = new ModbusDeviceRouter(onboard, () => transport);
    router.configure({ version: 1, physicalPoints: [], logicalChannels: [], modbus: config });
    const point = {
      id: 'p',
      channel: 0,
      hardwareProfile: '879-1300' as const,
      modbus: { deviceId: 'meter', measurementId: 'import-energy' },
    };
    const reading = router.read(point);
    await expect(router.read(point)).rejects.toThrow('already in progress');
    release(Buffer.from([0, 0, 0, 12]));
    await expect(reading).resolves.toBe(12);
    await expect(router.write(point, true)).rejects.toThrow('read-only');
    expect(onboard.read).not.toHaveBeenCalled();
    expect(router.shouldPoll(point, 100)).toBe(true);
    expect(router.shouldPoll(point, 101)).toBe(false);
    expect(validateModbus({ ...config, profiles: [BUILTIN_MODBUS_PROFILES[0]] }).length).toBeGreaterThan(0);
  });
});
