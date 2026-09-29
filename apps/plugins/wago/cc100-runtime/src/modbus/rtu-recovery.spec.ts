import { QueuedModbusTransport, type SerialExchange } from './transports';
import { rtuFrame } from './protocol';

describe('RTU bus recovery after a quarantining failure (injected exchange, no device)', () => {
  let bus = 0;
  const connection = () => ({
    id: 'serial',
    transport: 'rtu' as const,
    path: `/dev/recovery-fixture-${++bus}`,
    baudRate: 19200,
    parity: 'even' as const,
    stopBits: 1 as const,
    timeoutMs: 25,
    reconnectMs: 0,
    queueLimit: 2,
  });
  const read = Buffer.from([3, 0, 12, 0, 1]);
  const readReply = rtuFrame(1, Buffer.from([3, 2, 0, 99]));
  const write = Buffer.from([6, 0, 1, 0, 1]);
  const writeReply = rtuFrame(1, write);
  const hang: SerialExchange = (_c, _r, signal) =>
    new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resumes reads once a probe read succeeds after the quiet period', async () => {
    const serial = jest.fn<ReturnType<SerialExchange>, Parameters<SerialExchange>>().mockImplementationOnce(hang);
    serial.mockResolvedValue(readReply);
    const transport = new QueuedModbusTransport(connection(), serial);
    const first = transport.request(1, read).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(25);
    expect(await first).toEqual(expect.objectContaining({ code: 'modbus_rtu_quarantined' }));
    await expect(transport.request(1, read)).rejects.toThrow('quarantin');
    expect(serial).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(50);
    expect(serial).toHaveBeenCalledTimes(2); // the probe
    await expect(transport.request(1, read)).resolves.toEqual(Buffer.from([0, 99]));
  });

  it('keeps failing fast and backs off while probes fail, then recovers', async () => {
    const serial = jest.fn<ReturnType<SerialExchange>, Parameters<SerialExchange>>().mockImplementationOnce(hang);
    serial.mockRejectedValueOnce(new Error('meter off')).mockResolvedValue(readReply);
    const transport = new QueuedModbusTransport(connection(), serial);
    const first = transport.request(1, read).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(25);
    await first;

    await jest.advanceTimersByTimeAsync(50); // first probe fails
    expect(serial).toHaveBeenCalledTimes(2);
    await expect(transport.request(1, read)).rejects.toThrow('quarantin');
    await jest.advanceTimersByTimeAsync(99); // backoff doubled to 100ms
    expect(serial).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(serial).toHaveBeenCalledTimes(3);
    await expect(transport.request(1, read)).resolves.toBeDefined();
  });

  it('rejects a probe reply from the wrong unit and stays quarantined', async () => {
    const serial = jest.fn<ReturnType<SerialExchange>, Parameters<SerialExchange>>().mockImplementationOnce(hang);
    serial.mockResolvedValue(rtuFrame(2, Buffer.from([3, 2, 0, 99])));
    const transport = new QueuedModbusTransport(connection(), serial);
    const first = transport.request(1, read).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(25);
    await first;
    await jest.advanceTimersByTimeAsync(50);
    expect(serial).toHaveBeenCalledTimes(2);
    await expect(transport.request(1, read)).rejects.toThrow('quarantin');
  });

  it('never self-recovers after a failed write, which may have reached the device', async () => {
    const serial = jest.fn<ReturnType<SerialExchange>, Parameters<SerialExchange>>().mockImplementationOnce(hang);
    serial.mockResolvedValue(writeReply);
    const transport = new QueuedModbusTransport(connection(), serial);
    const first = transport.request(1, write).catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(25);
    expect(await first).toEqual(expect.objectContaining({ code: 'modbus_rtu_quarantined' }));
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(serial).toHaveBeenCalledTimes(1);
    await expect(transport.request(1, read)).rejects.toThrow('quarantin');
  });
});
