import * as processes from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { WriteAdmissionError } from '../runtime-types';
import { QueuedModbusTransport, serialExchange } from './transports';
import { rtuFrame } from './protocol';
jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

describe('RTU production process teardown (injected process, no device)', () => {
  let child: EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    stdio: PassThrough[];
    kill: jest.Mock;
  };
  let spawn: jest.MockedFunction<typeof processes.spawn>;
  let bus = 0;
  const connection = () => ({
    id: 'serial',
    transport: 'rtu' as const,
    path: `/dev/teardown-fixture-${++bus}`,
    baudRate: 19200,
    parity: 'even' as const,
    stopBits: 1 as const,
    timeoutMs: 25,
    reconnectMs: 0,
    queueLimit: 2,
  });
  beforeEach(() => {
    jest.useFakeTimers();
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdio: [new PassThrough(), new PassThrough(), new PassThrough(), new PassThrough()],
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: jest.fn(),
    });
    spawn = jest.mocked(processes.spawn);
    spawn.mockReset().mockReturnValue(child as unknown as ReturnType<typeof processes.spawn>);
  });
  afterEach(() => {
    child.stdin.destroy();
    child.stdio.forEach((stream) => stream.destroy());
    child.stdout.destroy();
    child.stderr.destroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('does not settle native serial until close, and never accepts data received after timeout', async () => {
    let settled = false;
    const result = serialExchange(connection(), Buffer.from([1, 3, 0, 12, 0, 1]))
      .then(
        () => 'accepted',
        (error: Error) => error,
      )
      .finally(() => {
        settled = true;
      });
    await jest.advanceTimersByTimeAsync(25);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    const grant = jest.spyOn(child.stdin, 'end');
    child.stdio[3].write('R');
    expect(grant).not.toHaveBeenCalled();
    child.stdout.write(rtuFrame(1, Buffer.from([3, 2, 0, 99])));
    child.emit('close', 0);
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('timed out') }));
  });
  it('denied admission retains the bus until close without authorizing transmission', async () => {
    const c = connection();
    const bus = new QueuedModbusTransport(c);
    let current = true;
    let settled = false;
    const result = bus
      .request(1, Buffer.from([6, 0, 12, 0, 1]), () => {
        if (!current) throw new WriteAdmissionError('outage_ended');
        return true;
      })
      .catch((error: Error) => error)
      .finally(() => {
        settled = true;
      });
    await jest.advanceTimersByTimeAsync(0);
    const grant = jest.spyOn(child.stdin, 'end');
    current = false;
    child.stdio[3].write('R');
    const queued = bus.request(1, Buffer.from([6, 0, 12, 0, 0])).catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(0);
    expect(grant).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
    child.emit('close', -1);
    expect(await result).toMatchObject({ code: 'outage_ended' });
    await jest.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    child.emit('close', -1);
    await queued;
  });

  it('waits for close after a spawn/process error', async () => {
    let settled = false;
    const result = serialExchange(connection(), Buffer.alloc(8))
      .catch((error: Error) => error)
      .finally(() => {
        settled = true;
      });
    child.emit('error', new Error('process failure'));
    await Promise.resolve();
    expect(settled).toBe(false);
    child.emit('close', -1);
    expect(await result).toEqual(expect.objectContaining({ message: 'process failure' }));
  });
  it('quarantines replacements while native teardown is delayed and after the process closes', async () => {
    const c = connection();
    const request = Buffer.from([3, 0, 12, 0, 1]);
    const transport = new QueuedModbusTransport(c);
    const result = transport.request(1, request).catch((error: Error) => error);
    await jest.advanceTimersByTimeAsync(25);
    expect(await result).toEqual(expect.objectContaining({ code: 'modbus_rtu_quarantined' }));
    const replacement = new QueuedModbusTransport(c);
    const differentAddress = Buffer.from([3, 0, 22, 0, 1]);
    await expect(replacement.request(1, differentAddress)).rejects.toThrow('quarantin');
    expect(spawn).toHaveBeenCalledTimes(1);
    child.stdout.write(rtuFrame(1, Buffer.from([3, 2, 0, 99])));
    child.emit('close', 0);
    await Promise.resolve();
    await expect(replacement.request(1, differentAddress)).rejects.toThrow('quarantin');
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
