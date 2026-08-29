import { createServer } from 'node:net';
import { ModbusTcpAdapter } from './adapters';
import type { Snapshot } from './runtime';

const point: Snapshot['physicalPoints'][number] = { id: 'input', hardwareProfile: '751-9301', channel: 0 };

describe('ModbusTcpAdapter', () => {
  it('completes a request when a complete response frame arrives', async () => {
    const server = createServer((socket) => {
      socket.once('data', (request) => {
        const response = Buffer.alloc(10);
        request.copy(response, 0, 0, 2);
        response.writeUInt16BE(0, 2);
        response.writeUInt16BE(4, 4);
        response[6] = 1;
        response[7] = 2;
        response[8] = 1;
        response[9] = 1;
        socket.write(response);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not expose a TCP port');

    await expect(new ModbusTcpAdapter('127.0.0.1', address.port).read(point)).resolves.toBe(true);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
});
