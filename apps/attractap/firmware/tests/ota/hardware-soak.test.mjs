import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import WebSocket from 'ws';

test('resume before the delayed offer does not arm a stale 0% timeout', { timeout: 10000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'attractap-ota-fixture-'));
  const image = Buffer.alloc(16384);
  image[0] = 0xe9;
  image.writeUInt32LE(0xabcd5432, 32);
  image.write('test', 48);
  const firmware = join(directory, 'test.bin');
  await writeFile(firmware, image);
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const fixture = spawn(process.execPath, [fileURLToPath(new URL('./hardware-soak.mjs', import.meta.url)),
    '--firmware', firmware, '--reader-id', '1', '--port', String(port), '--cycles', '1',
    '--disconnect-at', '4096', '--offer-delay-ms', '150', '--first-chunk-timeout-ms', '250',
    '--timeout-ms', '6000'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const sockets = new Set();
  const timers = new Set();
  let connections = 0;
  let output = '';
  let started = false;
  let done = false;
  t.after(async () => {
    done = true;
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.terminate();
    fixture.kill();
    await rm(directory, { recursive: true, force: true });
  });

  function connect() {
    if (done) return;
    const connection = ++connections;
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/attractap/websocket`);
    sockets.add(socket);
    let offset = 0;
    const send = (type, payload = {}) => socket.send(JSON.stringify({ event: 'EVENT', data: { type, payload } }));
    const request = () => send('FIRMWARE_REQUEST_CHUNK', { offset, length: 4096 });
    socket.on('error', () => {});
    socket.on('close', () => { if (connection < 3) connect(); });
    socket.on('message', (bytes, binary) => {
      if (binary) {
        if (connection === 1) return; // The fixture interrupts this socket.
        offset += bytes.length;
        if (offset === image.length) return socket.close(); // Simulated reboot.
        // Keep the resumed transfer active beyond offerDelay + first timeout.
        timers.add(setTimeout(request, 200));
        return;
      }
      const { type } = JSON.parse(bytes).data;
      if (type === 'READER_REQUEST_AUTHENTICATION') send('READER_AUTHENTICATE', { id: 1 });
      if (type === 'READER_AUTHENTICATED') {
        send('ACK_READER_AUTHENTICATED');
        send('READER_FIRMWARE_INFO', { name: 'test', variant: 'wifi', version: 'test' });
        // The real updater may resume from tick() before a re-offer arrives.
        if (connection === 2) request();
      }
      if (type === 'READER_FIRMWARE_UPDATE_REQUIRED') {
        send('ACK_READER_FIRMWARE_UPDATE_REQUIRED');
        if (connection === 1) request();
      }
    });
  }
  fixture.stdout.on('data', (bytes) => {
    output += bytes;
    if (!started && output.includes('OTA fixture on port')) { started = true; connect(); }
  });
  fixture.stderr.on('data', (bytes) => { output += bytes; });
  const [code] = await once(fixture, 'exit');
  assert.equal(code, 0, output);
  assert.match(output, /First request: offset=0/);
  assert.match(output, /PASS: 1 complete OTA transfers and final firmware boot/);
  assert.equal(connections, 3);
});
