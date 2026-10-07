import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { type ModbusConnection } from '../../../modbus/model';
import { WriteAdmissionError } from '../runtime-types';
import { TransactionAdmission } from './transport-contracts';
import { ModbusTransportError, SerialAdmissionRejected } from './transport-errors';
import { SERIAL_PROGRAM } from './transports.serial-program';

export function serialExchange(
  c: Extract<ModbusConnection, { transport: 'rtu' }>,
  request: Buffer,
  signal?: AbortSignal,
  isCurrent?: TransactionAdmission,
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
        isCurrent?.expiresAt === undefined ? '' : String(isCurrent.expiresAt),
      ],
      { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] },
    );
    let output = Buffer.alloc(0);
    let failure: Error | undefined;
    let authorized = false;
    const abort = () => {
      failure ??= new Error('RTU exchange timed out or aborted');
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, c.timeoutMs);
    const fail = (error: Error) => {
      failure ??= error;
      child.kill('SIGKILL');
    };
    // A private pipe carries exactly one readiness byte; stdout remains binary RTU data.
    (child.stdio[3] as Readable).on('data', (chunk: Buffer) => {
      if (failure) return;
      if (authorized || chunk.length !== 1 || chunk[0] !== 82) {
        fail(new Error('invalid serial admission handshake'));
        return;
      }
      try {
        if (isCurrent && !isCurrent())
          throw new ModbusTransportError(
            'modbus_configuration_changed',
            'Modbus configuration changed before transmission',
          );
      } catch (error) {
        fail(new SerialAdmissionRejected(error));
        return;
      }
      authorized = true;
      child.stdin.end('GO\n');
    });
    (child.stdio[3] as Readable).on('error', fail);
    child.stdin.on('error', fail);
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
      else if (code === 75 && authorized && output.length === 0 && isCurrent?.expiresAt !== undefined)
        reject(new SerialAdmissionRejected(new WriteAdmissionError('expired')));
      else if (code !== 0 || !authorized)
        reject(new Error('RTU exchange failed or timed out (Python3/POSIX serial required)'));
      else resolve(output);
    });
  });
}
