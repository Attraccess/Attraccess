import { connect } from 'node:net';
import { type ModbusConnection } from '../../../modbus/model';
import { TransactionAdmission } from './transport-contracts';
import { ModbusTransportError } from './transport-errors';

export function tcpExchange(
  c: Extract<ModbusConnection, { transport: 'tcp' }>,
  transaction: number,
  unit: number,
  pdu: Buffer,
  isCurrent?: TransactionAdmission,
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
      try {
        if (isCurrent && !isCurrent())
          throw new ModbusTransportError(
            'modbus_configuration_changed',
            'Modbus configuration changed before transmission',
          );
      } catch (error) {
        finish(error as Error);
        return;
      }
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
