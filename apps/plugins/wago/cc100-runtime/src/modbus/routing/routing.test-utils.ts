import { createServer, type Server, type Socket } from 'node:net';
import { type ModbusConnection } from '../../../../modbus/model';

import { QueuedModbusTransport } from '../transport/transport';
export const format = {
  address: 12,
  addressBase: 1 as const,
  dataType: 'uint32' as const,
  byteOrder: 'big' as const,
  wordOrder: 'big' as const,
  scale: 1,
  offset: 0,
};

export const serial: Extract<ModbusConnection, { transport: 'rtu' }> = {
  id: 'bus',
  transport: 'rtu',
  path: '/dev/serial',
  baudRate: 19200,
  parity: 'even',
  stopBits: 1,
  timeoutMs: 50,
  reconnectMs: 0,
  queueLimit: 2,
};
let nextProtocolBus = 0;
export class ModbusProtocolFixture {
  server!: Server;

  readonly sockets = new Set<Socket>();

  async fixture(reply: (request: Buffer, socket: Socket) => void) {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= 7 && buffer.length >= buffer.readUInt16BE(4) + 6) reply(buffer, socket);
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('fixture address');
    return new QueuedModbusTransport({
      id: 'tcp',
      transport: 'tcp',
      host: '127.0.0.1',
      port: address.port,
      timeoutMs: 100,
      reconnectMs: 5,
      queueLimit: 2,
    });
  }

  response(request: Buffer, pdu: Buffer) {
    const h = Buffer.from(request.subarray(0, 7));
    h.writeUInt16BE(pdu.length + 1, 4);
    return Buffer.concat([h, pdu]);
  }

  setup() {
    serial.path = `/dev/fixture-protocol-${++nextProtocolBus}`;
  }

  async cleanup() {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.server) await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
