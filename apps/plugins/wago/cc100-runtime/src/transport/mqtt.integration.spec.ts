import { once } from 'node:events';
import { createServer, type Socket, type AddressInfo } from 'node:net';
import { connect, type MqttClient } from 'mqtt';
import { MqttTransport } from './mqtt';

// A tiny MQTT fixture deliberately withholds PUBACK while still answering
// PINGREQ, matching the observed live socket with stalled telemetry.
test('recovers lost PUBACKs over a real MQTT socket without retransmitting stale telemetry', async () => {
  const sockets = new Set<Socket>();
  const publications: Array<{ connection: number; topic: string; payload: string }> = [];
  let connections = 0;
  let pingResponses = 0;
  const broker = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const connection = ++connections;
    let buffered = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length >= 2) {
        let length = 0;
        let offset = 1;
        let multiplier = 1;
        let byte: number;
        do {
          if (offset === buffered.length) return;
          byte = buffered[offset++];
          length += (byte & 127) * multiplier;
          multiplier *= 128;
        } while (byte & 128);
        if (buffered.length < offset + length) return;
        const command = buffered[0] >> 4;
        const body = buffered.subarray(offset, offset + length);
        buffered = buffered.subarray(offset + length);
        if (command === 1) socket.write(Buffer.from([0x20, 2, 0, 0])); // CONNACK
        if (command === 12) {
          pingResponses++;
          socket.write(Buffer.from([0xd0, 0])); // PINGRESP
        }
        if (command === 3) {
          const topicLength = body.readUInt16BE(0);
          publications.push({
            connection,
            topic: body.subarray(2, 2 + topicLength).toString(),
            payload: body.subarray(4 + topicLength).toString(),
          });
          if (connection > 1) socket.write(Buffer.from([0x40, 2, body[2 + topicLength], body[3 + topicLength]])); // PUBACK
        }
      }
    });
  });
  let client: MqttClient | undefined;
  try {
    broker.listen(0, '127.0.0.1');
    await once(broker, 'listening');
    client = connect(`mqtt://127.0.0.1:${(broker.address() as AddressInfo).port}`, {
      reconnectPeriod: 25,
      connectTimeout: 1000,
      keepalive: 1,
    });
    client.on('error', jest.fn());
    const transport = new MqttTransport(client, jest.fn());
    await once(client, 'connect');
    const restored = once(client, 'connect');
    const results = await Promise.allSettled([
      transport.publish('measurements', { sequence: 1 }),
      transport.publish('heartbeat', { sequence: 2 }),
    ]);
    expect(results).toEqual([
      { status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('timed out') }) },
      { status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('timed out') }) },
    ]);
    expect(pingResponses).toBeGreaterThan(0);
    await restored;
    expect(Object.keys(client.outgoing)).toHaveLength(0);
    await transport.publish('measurements', { sequence: 3 });
    expect(publications.filter(({ connection }) => connection > 1)).toEqual([
      { connection: 2, topic: 'measurements', payload: JSON.stringify({ sequence: 3 }) },
    ]);
  } finally {
    if (client) await new Promise<void>((resolve) => client?.end(true, {}, resolve));
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => broker.close((error) => (error ? reject(error) : resolve())));
  }
}, 20_000);
