import { posix } from 'node:path';
import { type ModbusConnection, modbusHostIdentity } from '../../../../modbus/model';
import { Bus, buses, quarantineBus } from './bus-recovery';
import { ModbusException, rtuFrame, validateRequest, validateResponse } from '../protocol/protocol';
import { serialExchange } from './serial';
import { tcpExchange } from './tcp';
import { BusRecovery, ModbusTransport, READ_FUNCTION_CODES, SerialExchange, TransactionAdmission } from './contracts';
import { ModbusTransportError, SerialAdmissionRejected } from './errors';
import { deadline, rtuPayload } from './framing';

export /** Linux production RTU using Python's standard POSIX termios/select, no native npm addon.
 * Opens only the configured serial path; raw 8-bit framing; exclusive advisory lock;
 * flushes stale input and observes >=3.5 character silence before sending.
 */
const SERIAL_PROGRAM = `
import os,sys,termios,select,time,fcntl
path,baud,parity,stop,timeout,hexdata,expires=sys.argv[1:]
end=time.monotonic()+float(timeout)/1000
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
 request=bytes.fromhex(hexdata); started=False
 while request:
  if not select.select([], [fd], [], max(0,end-time.monotonic()))[1]: raise TimeoutError('serial write timeout')
  if not started:
   # All potentially slow preparation and readiness waits precede admission.
   os.write(3,b'R')
   if sys.stdin.buffer.readline()!=b'GO\\n': raise RuntimeError('serial admission denied')
   if expires and time.time()*1000>=float(expires): sys.exit(75)
  if time.monotonic()>=end: raise TimeoutError('serial write timeout')
  n=os.write(fd,request)
  if n<=0: raise RuntimeError('serial write made no progress')
  started=True; request=request[n:]
 response=b''
 while time.monotonic()<end:
  if not select.select([fd],[],[],max(0,end-time.monotonic()))[0]: break
  response+=os.read(fd,256)
  if len(response)>256: raise ValueError('oversized RTU frame')
  if len(response)>=3:
   size=5 if response[1]&128 else (response[2]+5 if response[1] in (1,3,4) else 8)
   if len(response)>=size: sys.stdout.buffer.write(response); break
 else: raise TimeoutError('serial read timeout')
 if not response: raise TimeoutError('serial read timeout')
finally:
 os.close(fd)
`;

/** One FIFO per bus, including all unit IDs. Failed writes are never replayed. */
export class QueuedModbusTransport implements ModbusTransport {
  private transaction = 0;
  constructor(
    private readonly connection: ModbusConnection,
    private readonly serial: SerialExchange = serialExchange,
  ) {}
  request(unit: number, pdu: Buffer, isCurrent?: TransactionAdmission): Promise<Buffer> {
    try {
      validateRequest(unit, pdu);
    } catch (error) {
      return Promise.reject(error);
    }
    const key =
      this.connection.transport === 'tcp'
        ? `tcp:${modbusHostIdentity(this.connection.host)}:${this.connection.port}`
        : `rtu:${posix.normalize(this.connection.path).replace(/\/$/, '')}`;
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
    // Only an idempotent read may probe the bus back to life; a failed write may have reached the device.
    const recovery = (): BusRecovery | undefined =>
      READ_FUNCTION_CODES.has(pdu[0])
        ? {
            delayMs: Math.max(2 * this.connection.timeoutMs, this.connection.reconnectMs),
            probe: async () => {
              if (isCurrent && !isCurrent()) throw new Error('Modbus configuration changed before recovery');
              const connection = this.connection;
              if (connection.transport !== 'rtu') throw new Error('only RTU buses are probed');
              const abort = new AbortController();
              const operation = this.serial(connection, rtuFrame(unit, pdu), abort.signal, isCurrent);
              const teardown = operation.catch(() => undefined);
              try {
                const frame = await deadline(operation, connection.timeoutMs, () => abort.abort());
                validateResponse(pdu, rtuPayload(frame, unit));
              } finally {
                await teardown;
              }
            },
          }
        : undefined;
    if (queue.quarantined) {
      // Keep the endpoint quarantined, but let a current read supply corrected framing/unit/map.
      // A failed write has no recovery and must never be made recoverable by a later read.
      if (queue.recovery && (!isCurrent || isCurrent())) queue.recovery = recovery() ?? queue.recovery;
      return Promise.reject(queue.quarantined);
    }
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
          response = await tcpExchange(this.connection, ++this.transaction & 0xffff, unit, pdu, isCurrent);
        else {
          const abort = new AbortController();
          const operation = this.serial(this.connection, rtuFrame(unit, pdu), abort.signal, isCurrent);
          // The public deadline is bounded, but the bus remains owned until teardown settles.
          teardown = operation.catch(() => undefined);
          const frame = await deadline(operation, this.connection.timeoutMs, () => {
            quarantineBus(queue, 'Modbus RTU request timed out; bus quarantined', recovery());
            abort.abort();
          });
          response = rtuPayload(frame, unit);
        }
        return validateResponse(pdu, response);
      } catch (error) {
        if (error instanceof SerialAdmissionRejected) throw error.reason;
        // A valid exception response completes a transaction. Every ambiguous RTU failure fails closed.
        if (this.connection.transport === 'rtu' && !(error instanceof ModbusException))
          quarantineBus(
            queue,
            `Modbus RTU bus quarantined: ${error instanceof Error ? error.message : 'ambiguous transaction'}`,
            recovery(),
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

export { serialExchange } from './serial';

export { type ModbusTransport, type SerialExchange } from './contracts';

export { ModbusTransportError } from './errors';
