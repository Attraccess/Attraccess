import { posix } from 'node:path';
// Shared pure configuration model is bundled into the standalone runtime.
import { type ModbusConnection, modbusHostIdentity } from '../../../modbus/model';
import { Bus, buses, quarantineBus } from './bus-recovery';
import { ModbusException, rtuFrame, validateRequest, validateResponse } from './protocol';
import { serialExchange } from './serial-exchange';
import { tcpExchange } from './tcp-exchange';
import {
  BusRecovery,
  ModbusTransport,
  READ_FUNCTION_CODES,
  SerialExchange,
  TransactionAdmission,
} from './transport-contracts';
import { ModbusTransportError, SerialAdmissionRejected } from './transport-errors';
import { deadline, rtuPayload } from './transport-framing';

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

export { serialExchange } from './serial-exchange';
export { type ModbusTransport, type SerialExchange } from './transport-contracts';
export { ModbusTransportError } from './transport-errors';
