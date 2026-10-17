import { type ModbusConnection } from '../../../../modbus/model';

import { crc16, readPdu, rtuFrame, writePdu } from './protocol';
import { QueuedModbusTransport } from '../transport/transport';
import { ModbusProtocolFixture, format, serial } from '../routing/routing.test-utils';
describe('Modbus protocol fixtures (no hardware)', () => {
  let fixture: ModbusProtocolFixture;
  beforeEach(() => {
    fixture = new ModbusProtocolFixture();
    fixture.setup();
  });
  afterEach(async () => {
    await fixture.cleanup();
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
    await expect(transport.request(1, Buffer.from([2, 0, 0, 0, 1]))).rejects.toThrow('function');
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
});
