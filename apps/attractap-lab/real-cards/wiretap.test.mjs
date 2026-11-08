// wiretap.cjs runs inside a real TLS server in a child process (as it does inside the lab API);
// this process is the reader on the other end of the TLS link.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const wiretap = join(dirname(fileURLToPath(import.meta.url)), 'wiretap.cjs');
// The link needs no certificate: both ends share a made-up pre-shared key.
const PSK = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const TLS_OPTIONS = { ciphers: 'PSK-AES128-GCM-SHA256', maxVersion: 'TLSv1.2' };

const frame = (type, body) => {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
};
const message = (type, payload) => frame(1, JSON.stringify({ event: 'EVENT', data: { type, payload } }));

// The API side: sends its frames on connect, answers the reader's first frame with a ChangeKey APDU
// (the step the lab's drop fault targets), and exits once the link is closed.
const SERVER = `
const tls = require('node:tls');
require(process.env.WIRETAP_MODULE);
const frame = ${frame.toString()};
const message = ${message.toString()};
const server = tls.createServer({ ...${JSON.stringify(TLS_OPTIONS)}, pskCallback: () => Buffer.from('${PSK.toString('hex')}', 'hex') }, (socket) => {
  let heard = 0;
  socket.on('data', (chunk) => {
    heard++;
    console.log('listener ' + chunk.length);
    if (heard === 1 && process.env.SECOND_APDU) socket.write(message('CARD_APDU', { conversationId: 'c', seq: 2, apdu: process.env.SECOND_APDU }));
    else socket.end();
  });
  socket.on('close', () => { console.log('closed'); server.close(); });
  const apdu = message('CARD_APDU', { conversationId: 'c', seq: 1, apdu: process.env.FIRST_APDU });
  socket.write(apdu.subarray(0, 7));
  socket.write(Buffer.concat([apdu.subarray(7), frame(2, Buffer.from([1, 2, 3]))]));
  socket.write(frame(1, JSON.stringify({ event: 'PING' })).toString('latin1'));
  socket.write(frame(1, 'null'));
  socket.write(frame(1, 'not json'));
  socket.write(Buffer.from([9, 0, 0, 0, 1, 0xff]));
  socket.write(Buffer.from([1, 0x7f, 0xff, 0xff, 0xff, 0]));
});
server.listen(0, '127.0.0.1', () => console.log('port ' + server.address().port));
`;

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'wiretap-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Starts the API side, connects as the reader and answers every CARD_APDU it sees by seq.
async function session(env) {
  const child = spawn(process.execPath, ['-e', SERVER], {
    env: { ...process.env, WIRETAP_MODULE: wiretap, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      stdout += d;
      const m = /port (\d+)/.exec(stdout);
      if (m) resolve(Number(m[1]));
    });
    child.once('exit', () => reject(new Error(`server exited: ${stderr}`)));
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const reader = tls.connect({
    ...TLS_OPTIONS,
    port,
    host: '127.0.0.1',
    pskCallback: () => ({ psk: PSK, identity: 'reader' }),
    checkServerIdentity: () => undefined,
  });
  let received = '';
  const answered = new Set();
  reader.on('data', (chunk) => {
    received += chunk.toString('latin1');
    for (const seq of [1, 2]) {
      if (answered.has(seq) || !received.includes(`"seq":${seq}`)) continue;
      answered.add(seq);
      const response = message('CARD_APDU_RESPONSE', {
        conversationId: 'c',
        seq,
        response: seq === 1 ? '04010112001A0591AF' : '9100',
      });
      // A frame that is not a card answer travels in the same chunk.
      reader.write(seq === 1 ? Buffer.concat([message('HEARTBEAT', {}), response]) : response);
    }
  });
  reader.on('error', () => undefined);
  const closed = new Promise((resolve) => reader.once('close', resolve));
  const code = await exited;
  await closed;
  return { code, stdout, stderr, answered: [...answered] };
}

const lines = (file) =>
  readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .map(({ t, ...rest }) => {
      assert.equal(typeof t, 'number');
      if (rest.ev === 'wiretap-loaded') assert.equal(typeof rest.pid, 'number');
      delete rest.pid;
      return rest;
    });

const sentOnConnect = (firstApdu) => [
  { ev: 'open', sock: 1 },
  {
    sock: 1,
    dir: 's2r',
    type: 'CARD_APDU',
    payload: { conversationId: 'c', seq: 1, apdu: firstApdu },
    bytes: message('CARD_APDU', { conversationId: 'c', seq: 1, apdu: firstApdu }).length - 5,
  },
  { sock: 1, dir: 's2r', ftype: 2, bytes: 3 },
  { sock: 1, dir: 's2r', type: undefined, payload: undefined, bytes: 16 },
  { sock: 1, dir: 's2r', type: undefined, payload: undefined, bytes: 4 },
  { sock: 1, dir: 's2r', ftype: 1, unparsable: 8 },
];
const heartbeat = { sock: 1, dir: 'r2s', type: 'HEARTBEAT', payload: {}, bytes: message('HEARTBEAT', {}).length - 5 };
const response = (seq, value) => ({
  sock: 1,
  dir: 'r2s',
  type: 'CARD_APDU_RESPONSE',
  payload: { conversationId: 'c', seq, response: value },
  bytes: message('CARD_APDU_RESPONSE', { conversationId: 'c', seq, response: value }).length - 5,
});
const parsed = (entries) => JSON.parse(JSON.stringify(entries));

test('records both directions and drops the answer to the armed APDU once', async (t) => {
  const dir = tempDir(t);
  const file = join(dir, 'wiretap.jsonl');
  const drop = join(dir, 'drop.arm');
  writeFileSync(drop, '90C4\n');
  const changeKey = `90C4000029${'01'.repeat(41)}00`;
  const run = await session({
    WIRETAP_FILE: file,
    WIRETAP_DROP: drop,
    FIRST_APDU: '9060000000',
    SECOND_APDU: changeKey,
  });
  assert.equal(run.code, 0, run.stderr);
  assert.deepEqual(run.answered, [1, 2]);
  // The API heard the first answer, never the dropped one.
  assert.equal(run.stdout.match(/listener/g).length, 1);
  assert.match(run.stdout, /closed/);
  assert.equal(existsSync(drop), false);
  const changeKeyMessage = message('CARD_APDU', { conversationId: 'c', seq: 2, apdu: changeKey });
  assert.deepEqual(
    lines(file),
    parsed([
      { ev: 'wiretap-loaded' },
      ...sentOnConnect('9060000000'),
      heartbeat,
      response(1, '04010112001A0591AF'),
      {
        sock: 1,
        dir: 's2r',
        type: 'CARD_APDU',
        payload: { conversationId: 'c', seq: 2, apdu: changeKey },
        bytes: changeKeyMessage.length - 5,
      },
      { ...response(2, '9100'), dropped: true },
      { ev: 'drop', sock: 1 },
      { ev: 'close', sock: 1 },
    ]),
  );
});

for (const [name, env] of [
  ['without a drop file setting', {}],
  ['when the drop file is not armed', { WIRETAP_DROP: '/nonexistent/drop.arm' }],
  ['when the drop file is empty', { WIRETAP_DROP: 'EMPTY' }],
]) {
  test(`passes every answer through ${name}`, async (t) => {
    const dir = tempDir(t);
    const file = join(dir, 'wiretap.jsonl');
    if (env.WIRETAP_DROP === 'EMPTY') {
      env.WIRETAP_DROP = join(dir, 'drop.arm');
      writeFileSync(env.WIRETAP_DROP, '\n');
    }
    const run = await session({ ...env, WIRETAP_FILE: file, FIRST_APDU: '90c4000000' });
    assert.equal(run.code, 0, run.stderr);
    assert.equal(run.stdout.match(/listener/g).length, 1);
    assert.deepEqual(
      lines(file),
      parsed([
        { ev: 'wiretap-loaded' },
        ...sentOnConnect('90c4000000'),
        heartbeat,
        response(1, '04010112001A0591AF'),
        { ev: 'close', sock: 1 },
      ]),
    );
  });
}

test('refuses to load without an output file', () => {
  const env = { ...process.env };
  delete env.WIRETAP_FILE;
  const run = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(wiretap)})`], { env, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /WIRETAP_FILE is required/);
});
