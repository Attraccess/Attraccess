import { connect } from 'node:net';
import { spawn } from 'node:child_process';
// Shared pure configuration model is bundled into the standalone runtime.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { ModbusConnection } from '../../../modbus/model';
import { crc16, rtuFrame, validateResponse, validateRequest, ModbusException } from './protocol';

export type SerialExchange = (
  connection: Extract<ModbusConnection, { transport: 'rtu' }>,
  request: Buffer,
  /** Resolve/reject only after teardown; observe abort to stop a timed-out transaction. */
  signal?: AbortSignal,
) => Promise<Buffer>;
export interface ModbusTransport {
  request(unit: number, pdu: Buffer, isCurrent?: () => boolean): Promise<Buffer>;
}
export class ModbusTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
type Bus = {
  tail: Promise<unknown>;
  pending: number;
  retryAt: number;
  quarantined?: ModbusTransportError;
  quarantine: Promise<ModbusTransportError>;
  markQuarantined: (error: ModbusTransportError) => void;
};
const buses = new Map<string, Bus>();

/** One FIFO per bus, including all unit IDs. Failed writes are never replayed. */
export class QueuedModbusTransport implements ModbusTransport {
  private transaction = 0;
  constructor(
    private readonly connection: ModbusConnection,
    private readonly serial: SerialExchange = serialExchange,
  ) {}
  request(unit: number, pdu: Buffer, isCurrent?: () => boolean): Promise<Buffer> {
    try {
      validateRequest(unit, pdu);
    } catch (error) {
      return Promise.reject(error);
    }
    const key =
      this.connection.transport === 'tcp'
        ? `tcp:${this.connection.host.toLowerCase()}:${this.connection.port}`
        : `rtu:${this.connection.path}`;
    let bus = buses.get(key);
    if (!bus) {
      let markQuarantined!: Bus['markQuarantined'];
      const quarantine = new Promise<ModbusTransportError>((resolve) => {
        markQuarantined = resolve;
      });
      bus = { tail: Promise.resolve(), pending: 0, retryAt: 0, quarantine, markQuarantined };
      buses.set(key, bus);
    }
    const queue = bus;
    if (queue.quarantined) return Promise.reject(queue.quarantined);
    if (queue.pending >= this.connection.queueLimit) return Promise.reject(new Error('Modbus queue full'));
    queue.pending++;
    const work = queue.tail.then(async () => {
      const delay = queue.retryAt - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (queue.quarantined) throw queue.quarantined;
      if (isCurrent && !isCurrent()) throw new Error('Modbus configuration changed before transaction');
      let teardown: Promise<unknown> | undefined;
      try {
        let response: Buffer;
        if (this.connection.transport === 'tcp')
          response = await tcpExchange(this.connection, ++this.transaction & 0xffff, unit, pdu);
        else {
          const abort = new AbortController();
          const operation = this.serial(this.connection, rtuFrame(unit, pdu), abort.signal);
          // The public deadline is bounded, but the bus remains owned until teardown settles.
          teardown = operation.catch(() => undefined);
          const frame = await deadline(operation, this.connection.timeoutMs, () => {
            quarantineBus(queue, 'Modbus RTU request timed out; bus quarantined pending external resynchronization');
            abort.abort();
          });
          if (
            frame.length < 5 ||
            frame.length > 256 ||
            frame[0] !== unit ||
            crc16(frame.subarray(0, -2)) !== frame.readUInt16LE(frame.length - 2)
          )
            throw new Error('Modbus RTU unit/CRC/length mismatch');
          response = frame.subarray(1, -2);
        }
        return validateResponse(pdu, response);
      } catch (error) {
        // A valid exception response completes a transaction. Every ambiguous RTU failure fails closed.
        if (this.connection.transport === 'rtu' && !(error instanceof ModbusException))
          quarantineBus(
            queue,
            `Modbus RTU bus quarantined: ${error instanceof Error ? error.message : 'ambiguous transaction'}; external resynchronization required`,
          );
        queue.retryAt = Date.now() + this.connection.reconnectMs;
        throw error;
      } finally {
        await teardown;
      }
    });
    queue.tail = work
      .catch(() => undefined)
      .finally(async () => {
        queue.pending--;
        if (queue.pending === 0) {
          const delay = queue.retryAt - Date.now();
          if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
          if (queue.pending === 0 && !queue.quarantined) buses.delete(key);
        }
      });
    // Wake queued callers on quarantine even if a broken exchange never finishes teardown.
    return Promise.race([
      work,
      queue.quarantine.then((error) => {
        throw error;
      }),
    ]);
  }
}
function quarantineBus(bus: Bus, message: string): void {
  if (bus.quarantined) return;
  bus.quarantined = new ModbusTransportError('modbus_rtu_quarantined', message);
  bus.markQuarantined(bus.quarantined);
}
function deadline<T>(operation: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error('Modbus request timed out'));
    }, ms);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
function tcpExchange(
  c: Extract<ModbusConnection, { transport: 'tcp' }>,
  transaction: number,
  unit: number,
  pdu: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: c.host, port: c.port });
    let bytes = Buffer.alloc(0);
    let done = false;
    const finish = (error?: Error, result?: Buffer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result as Buffer);
    };
    const timer = setTimeout(() => finish(new Error('Modbus TCP timeout')), c.timeoutMs);
    socket.once('connect', () => {
      const header = Buffer.alloc(7);
      header.writeUInt16BE(transaction);
      header.writeUInt16BE(pdu.length + 1, 4);
      header[6] = unit;
      socket.write(Buffer.concat([header, pdu]));
    });
    socket.on('data', (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length < 7) return;
      const length = bytes.readUInt16BE(4);
      if (
        bytes.readUInt16BE(0) !== transaction ||
        bytes.readUInt16BE(2) !== 0 ||
        bytes[6] !== unit ||
        length < 2 ||
        length > 254 ||
        bytes.length > length + 6
      )
        return finish(new Error('Modbus TCP transaction/protocol/unit/length mismatch'));
      if (bytes.length === length + 6) finish(undefined, bytes.subarray(7));
    });
    socket.once('error', finish);
    socket.once('close', () => finish(new Error('Modbus TCP connection closed')));
  });
}

/** Linux production RTU using Python's standard POSIX termios/select, no native npm addon.
 * Opens only the configured serial path; raw 8-bit framing; exclusive advisory lock;
 * flushes stale input and observes >=3.5 character silence before sending.
 */
const SERIAL_PROGRAM = `
import os,sys,termios,select,time,fcntl
path,baud,parity,stop,timeout,hexdata=sys.argv[1:]
fd=os.open(path,os.O_RDWR|os.O_NOCTTY|os.O_NONBLOCK)
try:
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 a=termios.tcgetattr(fd)
 a[0]=0; a[1]=0; a[2]=termios.CLOCAL|termios.CREAD|termios.CS8; a[3]=0
 if parity!='none': a[2]|=termios.PARENB
 if parity=='odd': a[2]|=termios.PARODD
 if stop=='2': a[2]|=termios.CSTOPB
 a[4]=a[5]=getattr(termios,'B'+baud); a[6][termios.VMIN]=0; a[6][termios.VTIME]=0
 termios.tcsetattr(fd,termios.TCSANOW,a)
 time.sleep(max(0.00175,3.5*11/int(baud)))
 termios.tcflush(fd,termios.TCIOFLUSH)
 request=bytes.fromhex(hexdata); end=time.monotonic()+float(timeout)/1000
 while request:
  if not select.select([], [fd], [], max(0,end-time.monotonic()))[1]: raise TimeoutError('serial write timeout')
  n=os.write(fd,request); request=request[n:]
 response=b''
 while time.monotonic()<end:
  if not select.select([fd],[],[],max(0,end-time.monotonic()))[0]: break
  response+=os.read(fd,256)
  if len(response)>256: raise ValueError('oversized RTU frame')
  if len(response)>=3:
   size=5 if response[1]&128 else (response[2]+5 if response[1] in (3,4) else 8)
   if len(response)>=size: sys.stdout.buffer.write(response); break
 else: raise TimeoutError('serial read timeout')
 if not response: raise TimeoutError('serial read timeout')
finally:
 os.close(fd)
`;
export function serialExchange(
  c: Extract<ModbusConnection, { transport: 'rtu' }>,
  request: Buffer,
  signal?: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('RTU exchange aborted'));
      return;
    }
    const child = spawn(
      'python3',
      [
        '-c',
        SERIAL_PROGRAM,
        c.path,
        String(c.baudRate),
        c.parity,
        String(c.stopBits),
        String(c.timeoutMs),
        request.toString('hex'),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = Buffer.alloc(0);
    let failure: Error | undefined;
    const abort = () => {
      failure = new Error('RTU exchange timed out or aborted');
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, c.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]);
      if (output.length > 256) {
        failure = new Error('oversized RTU frame');
        child.kill('SIGKILL');
      }
    });
    child.stderr.resume();
    child.once('error', (error) => {
      // Node emits close after error; never release ownership before streams/process teardown.
      failure = error;
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error('RTU exchange failed or timed out (Python3/POSIX serial required)'));
      else resolve(output);
    });
  });
}
