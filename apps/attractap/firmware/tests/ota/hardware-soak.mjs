// Real-reader regression for OTA stalls, including NFC/Wi-Fi coexistence.
// Run on an isolated test network; this fixture accepts the selected reader
// without checking its production token and never logs that token.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { WebSocketServer } from 'ws';

const { values } = parseArgs({
  options: {
    firmware: { type: 'string' },
    'reader-id': { type: 'string' },
    port: { type: 'string', default: '3000' },
    cycles: { type: 'string', default: '3' },
    'disconnect-at': { type: 'string', default: '0' },
    'offer-delay-ms': { type: 'string', default: '0' },
    'first-chunk-timeout-ms': { type: 'string', default: '10000' },
    'transfer-timeout-ms': { type: 'string', default: '180000' },
    'timeout-ms': { type: 'string', default: '900000' },
  },
});
if (!values.firmware || !values['reader-id']) {
  throw new Error('Required: --firmware <app-only OTA.bin> --reader-id <device id>');
}
const numeric = (key, minimum) => {
  const number = Number(values[key]);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`Invalid --${key}`);
  return number;
};
const readerId = numeric('reader-id', 1);
const port = numeric('port', 1);
const cycles = numeric('cycles', 1);
const disconnectAt = numeric('disconnect-at', 0);
const offerDelay = numeric('offer-delay-ms', 0);
const firstChunkTimeout = numeric('first-chunk-timeout-ms', 1);
const transferTimeout = numeric('transfer-timeout-ms', 1);
const overallTimeout = numeric('timeout-ms', 1);
const image = readFileSync(values.firmware);
// ESP image header + first segment header precede the application descriptor.
if (image.length < 1024 || image[0] !== 0xe9 || image.readUInt32LE(32) !== 0xabcd5432) {
  throw new Error('Expected an app-only ESP OTA image, not a merged flash image');
}
const version = image.subarray(48, 80).toString('utf8').split('\0')[0];
const server = new WebSocketServer({ host: '0.0.0.0', port, path: '/api/attractap/websocket' });
const timers = new Set();
let completed = 0;
let activeSocket;
let interrupted = false;
let done = false;
let bootTimer;
let resumeRange;
let cycleNumber = -1;
let cycleTimer;
let lastOffset = 0;

function finish(ok, reason) {
  if (done) return;
  done = true;
  for (const timer of timers) clearTimeout(timer);
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${reason}`);
  process.exitCode = ok ? 0 : 1;
  for (const socket of server.clients) socket.terminate();
  server.close(() => process.exit(ok ? 0 : 1));
}
function after(ms, callback) {
  const timer = setTimeout(callback, ms);
  timers.add(timer);
  return timer;
}
after(overallTimeout, () => finish(false, 'overall soak timeout'));
server.on('error', (error) => finish(false, error.message));
server.on('listening', () => console.log(`OTA fixture on port ${port}; reader=${readerId}; version=${version}; bytes=${image.length}`));
server.on('connection', (socket) => {
  if (done) return socket.terminate();
  let authenticated = false;
  let updateAcked = false;
  let expectedOffset = 0;
  let firstChunk = false;
  let transferFinished = false;
  let lastReportedPercent = 0;
  let offerStarted;
  let firstChunkTimer;
  let retryTimer;
  const sendEvent = (type, payload = {}) => socket.send(JSON.stringify({ event: 'EVENT', data: { type, payload } }));
  socket.on('error', (error) => {
    // A framing error closes the socket before a chunk arrives; surface the
    // protocol error instead of reporting only a later 0% timeout.
    if (error.code?.startsWith('WS_ERR_')) finish(false, error.message);
  });
  socket.on('message', (bytes, binary) => {
    if (binary || done) return;
    let message;
    try { message = JSON.parse(bytes.toString()); } catch {
      return finish(false, 'reader sent invalid JSON');
    }
    if (message.event === 'HEARTBEAT') {
      socket.send(JSON.stringify({ event: 'HEARTBEAT' }));
      return;
    }
    const { type, payload = {} } = message.data ?? {};
    if (type === 'READER_AUTHENTICATE') {
      if (payload.id !== readerId) return socket.close();
      // A reset may leave an old TCP connection half-open. Its timeout must
      // not fail the new transfer or keep the fixture alive after completion.
      if (activeSocket && activeSocket !== socket) {
        activeSocket.clearFixtureTimers();
        activeSocket.terminate();
      }
      activeSocket = socket;
      authenticated = true;
      sendEvent('READER_AUTHENTICATED', { name: 'OTA soak reader' });
      return;
    }
    if (!authenticated) return;
    if (type === 'ACK_READER_AUTHENTICATED') {
      sendEvent('RESOURCE_LIST', { revision: 1, readerName: 'OTA soak reader', ledBrightness: 50, resources: [] });
    } else if (type === 'READER_FIRMWARE_INFO') {
      clearTimeout(bootTimer);
      console.log(`Reader booted version ${payload.version}`);
      if (completed > 0 && payload.version !== version) return finish(false, `reader did not boot offered version ${version}`);
      if (completed === cycles) return finish(true, `${cycles} complete OTA transfers and final firmware boot`);
      if (offerStarted) return;
      offerStarted = Date.now();
      const offer = () => sendEvent('READER_FIRMWARE_UPDATE_REQUIRED', {
        available: { name: payload.name, variant: payload.variant, version, totalSize: image.length },
      });
      // Let the normal card-polling state start before OTA. Otherwise a fast
      // offer can race NFC startup and hide RF interference with Wi-Fi.
      after(offerDelay, () => {
        if (socket.readyState !== 1 || activeSocket !== socket) return;
        offerStarted = Date.now();
        console.log(`Offering transfer ${completed + 1}/${cycles}`);
        offer();
        retryTimer = setInterval(() => { if (!updateAcked && socket.readyState === 1) offer(); }, 4000);
        timers.add(retryTimer);
        if (!firstChunk) {
          firstChunkTimer = after(firstChunkTimeout, () => finish(false, 'OTA stuck at 0%: no first chunk request'));
        }
        if (cycleNumber !== completed) {
          cycleNumber = completed;
          lastOffset = 0;
          cycleTimer = after(transferTimeout, () => finish(false, `OTA failed to complete; last offset=${lastOffset}`));
        }
      });
    } else if (type === 'ACK_READER_FIRMWARE_UPDATE_REQUIRED') {
      updateAcked = true;
      clearInterval(retryTimer);
    } else if (type === 'FIRMWARE_REQUEST_CHUNK') {
      const { offset, length } = payload;
      if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || offset >= image.length || length < 1 || length > 4096) {
        return finish(false, 'invalid firmware chunk request');
      }
      if (firstChunk && offset !== expectedOffset) return finish(false, `out-of-order chunk: ${offset}, expected ${expectedOffset}`);
      if (!firstChunk) {
        if (resumeRange && (offset < resumeRange.minimum || offset > resumeRange.maximum)) {
          return finish(false, `reader failed to resume: offset=${offset}`);
        }
        resumeRange = undefined;
        firstChunk = true;
        clearTimeout(firstChunkTimer);
        console.log(`First request: offset=${offset}, ${Date.now() - offerStarted}ms after offer`);
      }
      const chunk = image.subarray(offset, Math.min(offset + length, image.length));
      socket.send(chunk, { binary: true });
      expectedOffset = offset + chunk.length;
      lastOffset = expectedOffset;
      const percent = Math.floor(expectedOffset * 100 / image.length);
      if (percent >= lastReportedPercent + 10) {
        lastReportedPercent = percent;
        console.log(`Transfer progress: ${percent}%, offset=${expectedOffset}`);
      }
      if (disconnectAt && !interrupted && expectedOffset >= disconnectAt && expectedOffset < image.length) {
        interrupted = true;
        resumeRange = { minimum: offset, maximum: expectedOffset };
        console.log(`Interrupting socket at offset ${expectedOffset}; reader must reconnect and resume`);
        socket.terminate();
      }
      if (expectedOffset === image.length && !transferFinished) {
        transferFinished = true;
        clearTimeout(cycleTimer);
        completed++;
        bootTimer = after(45000, () => finish(false, 'reader did not reboot and report firmware after 100%'));
        console.log(`Transfer ${completed}/${cycles} reached 100% in ${Date.now() - offerStarted}ms`);
      }
    }
  });
  socket.clearFixtureTimers = () => {
    clearInterval(retryTimer);
    clearTimeout(firstChunkTimer);
  };
  // A dropped connection does not count as progress. Keep its deadline until
  // a replacement authenticates, otherwise repeated reconnects hide a stall.
  socket.on('close', () => clearInterval(retryTimer));
  sendEvent('READER_REQUEST_AUTHENTICATION');
});
process.on('SIGINT', () => finish(false, 'interrupted'));
process.on('SIGTERM', () => finish(false, 'terminated'));
