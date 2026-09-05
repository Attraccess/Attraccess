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
});
