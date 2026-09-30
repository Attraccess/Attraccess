import { afterEach, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { MockServer } from './server';
const server = new MockServer();
afterEach(() => server.close());
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/attractap/websocket`);
  await once(socket, 'open');
  return socket;
}
test('uses the production envelope and isolates stale messages across reconnects', async () => {
  await server.start();
  const first = await connect();
  first.send(JSON.stringify({ event: 'EVENT', data: { type: 'READER_AUTHENTICATE', payload: { id: 267 } } }));
  expect((await server.waitForWebsocketMessage('READER_AUTHENTICATE', 0, 1)).payload.id).toBe(267);
  const close = once(first, 'close');
  server.disconnect();
  await close;
  const second = await connect();
  await expect(server.waitForWebsocketMessage('READER_AUTHENTICATE', 0, 2, 5)).rejects.toThrow('Timed out');
  second.send(JSON.stringify({ event: 'EVENT', data: { type: 'READER_AUTHENTICATE', payload: { id: 268 } } }));
  expect((await server.waitForWebsocketMessage('READER_AUTHENTICATE', 0, 2)).payload.id).toBe(268);
});
test('delivers binary OTA chunks without JSON/base64 transformation', async () => {
  await server.start();
  const socket = await connect();
  const received = once(socket, 'message');
  const bytes = Buffer.from([0xe9, 0, 255, 7]);
  server.sendBinary(bytes);
  const [frame, binary] = await received;
  expect(binary).toBe(true);
  expect(frame).toEqual(bytes);
});
