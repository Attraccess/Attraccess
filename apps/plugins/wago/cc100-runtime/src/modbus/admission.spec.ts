import { EventEmitter } from 'node:events';
import { connect } from 'node:net';
import { WriteAdmissionError } from '../runtime-types';
import { QueuedModbusTransport } from './transports';

jest.mock('node:net', () => ({ connect: jest.fn() }));

describe('TCP write admission (injected socket)', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['expired', 'revision'])('rechecks %s after connection setup before writing a frame', async (reason) => {
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn() });
    jest.mocked(connect).mockReturnValue(socket as unknown as ReturnType<typeof connect>);
    let current = true;
    const bus = new QueuedModbusTransport({
      id: 'fixture',
      transport: 'tcp',
      host: `${reason}.invalid`,
      port: 502,
      timeoutMs: 1000,
      reconnectMs: 0,
      queueLimit: 4,
    });
    const result = bus.request(1, Buffer.from([6, 0, 12, 0, 1]), () => {
      if (!current && reason === 'expired') throw new WriteAdmissionError('expired');
      return current;
    });
    const rejected = expect(result).rejects.toMatchObject({
      code: reason === 'expired' ? 'expired' : 'modbus_configuration_changed',
    });
    await Promise.resolve();
    expect(connect).toHaveBeenCalled();
    current = false;
    socket.emit('connect');
    await rejected;
    expect(socket.write).not.toHaveBeenCalled();
    expect(socket.destroy).toHaveBeenCalled();
  });
  it.each([
    ['2001:db8::1', '2001:0db8:0:0:0:0:0:1'],
    ['::ffff:192.0.2.1', '0:0:0:0:0:ffff:c000:201'],
  ])('serializes equivalent numeric connection aliases %s / %s', async (host, alias) => {
    jest.mocked(connect).mockClear();
    const socket = Object.assign(new EventEmitter(), { write: jest.fn(), destroy: jest.fn() });
    jest.mocked(connect).mockReturnValue(socket as unknown as ReturnType<typeof connect>);
    const c = {
      id: 'first',
      transport: 'tcp' as const,
      host,
      port: 502,
      timeoutMs: 1000,
      reconnectMs: 0,
      queueLimit: 4,
    };
    const pdu = Buffer.from([6, 0, 12, 0, 1]);
    const first = new QueuedModbusTransport(c).request(1, pdu);
    const second = new QueuedModbusTransport({ ...c, id: 'alias', host: alias }).request(1, pdu);
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(1);
    socket.emit('connect');
    socket.emit('data', socket.write.mock.calls[0][0]);
    await first;
    // Flush the shared queue's teardown before allowing the second socket to connect.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);
    socket.emit('connect');
    socket.emit('data', socket.write.mock.calls[1][0]);
    await second;
  });
});
