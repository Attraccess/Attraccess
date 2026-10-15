// Host-only feasibility bench. No reader keys, eFuses, or production API are used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { X509Certificate, constants } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createTlsServer, connect } from 'node:tls';
import { after, before, test } from 'node:test';
import WebSocket, { WebSocketServer, createWebSocketStream } from 'ws';

const profile = {
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.2',
  ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
  secureOptions: constants.SSL_OP_NO_TICKET,
};
let directory;
let credentials;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'attractap-channel-'));
  const openssl = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: 'pipe' });
  const read = (name) => readFileSync(join(directory, name));
  openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-days',
    '2',
    '-subj',
    '/CN=Bench CA',
  );
  openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'forged.key',
    '-out',
    'forged.pem',
    '-days',
    '2',
    '-subj',
    '/CN=reader',
  );
  for (const name of ['server', 'reader', 'unenrolled', 'expired']) {
    openssl(
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.csr`,
      '-subj',
      `/CN=${name}`,
    );
    writeFileSync(
      join(directory, 'extensions'),
      name === 'server'
        ? 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n'
        : 'extendedKeyUsage=clientAuth\n',
    );
    if (name === 'expired') {
      // Explicit past validity works with both OpenSSL and macOS LibreSSL.
      writeFileSync(join(directory, 'index'), '');
      writeFileSync(join(directory, 'serial'), '1000\n');
      writeFileSync(
        join(directory, 'expired.cnf'),
        `
[ca]
default_ca = bench
[bench]
database = index
serial = serial
new_certs_dir = .
certificate = ca.pem
private_key = ca.key
default_md = sha256
policy = policy
x509_extensions = client
[policy]
commonName = supplied
[client]
extendedKeyUsage = clientAuth
`,
      );
      openssl(
        'ca',
        '-batch',
        '-notext',
        '-config',
        'expired.cnf',
        '-in',
        'expired.csr',
        '-out',
        'expired.pem',
        '-startdate',
        '20000101000000Z',
        '-enddate',
        '20000102000000Z',
      );
      continue;
    }
    openssl(
      'x509',
      '-req',
      '-in',
      `${name}.csr`,
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      `${name}.pem`,
      '-days',
      '1',
      '-extfile',
      'extensions',
    );
  }
  credentials = {
    ca: read('ca.pem'),
    server: { key: read('server.key'), cert: read('server.pem') },
    reader: { key: read('reader.key'), cert: read('reader.pem') },
    unenrolled: { key: read('unenrolled.key'), cert: read('unenrolled.pem') },
    forged: { key: read('forged.key'), cert: read('forged.pem') },
    expired: { key: read('expired.key'), cert: read('expired.pem') },
  };
});
after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function bench(t, options = {}) {
  const received = [];
  const wire = [];
  const reverseWire = [];
  const failures = [];
  let serverWs;
  const tlsSockets = new Set();
  const tlsServer = createTlsServer({
    ...profile,
    ...credentials.server,
    ca: credentials.ca,
    requestCert: true,
    rejectUnauthorized: true,
  });
  const fingerprint = new X509Certificate(credentials.reader.cert).fingerprint256;
  tlsServer.on('secureConnection', (socket) => {
    tlsSockets.add(socket);
    socket.on('error', (error) => {
      failures.push(error.code);
      socket.destroy();
      serverWs.terminate();
    });
    socket.disableRenegotiation();
    if (options.revoked || socket.getPeerCertificate().fingerprint256 !== fingerprint) {
      socket.destroy();
      return;
    }
    socket.on('data', (data) => {
      received.push(data.toString());
      socket.write(`ack:${data}`);
    });
  });
  tlsServer.on('tlsClientError', (error) => {
    failures.push(error.code);
    serverWs.terminate();
  });
  tlsServer.on('connection', (socket) => {
    tlsSockets.add(socket);
    socket.on('error', (error) => failures.push(error.code));
  });
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, perMessageDeflate: false });
  t.after(async () => {
    for (const socket of tlsSockets) socket.destroy();
    for (const socket of wss.clients) socket.terminate();
    await new Promise((resolve) => wss.close(resolve));
  });
  wss.on('connection', (ws) => {
    serverWs = ws;
    // Convert ordered binary WS messages to the reliable byte stream TLS needs.
    const stream = createWebSocketStream(ws);
    stream.on('error', (error) => failures.push(error.code));
    ws.on('message', (data) => wire.push(Buffer.from(data)));
    tlsServer.emit('connection', stream);
  });
  await once(wss, 'listening');
  const ws = new WebSocket(`ws://127.0.0.1:${wss.address().port}`, { perMessageDeflate: false });
  t.after(() => ws.terminate());
  await once(ws, 'open');
  ws.on('message', (data) => reverseWire.push(Buffer.from(data)));
  const stream = createWebSocketStream(ws);
  stream.on('error', (error) => failures.push(error.code));
  const socket = connect({
    ...profile,
    socket: stream,
    servername: options.servername ?? 'localhost',
    ca: options.wrongCa ? credentials.reader.cert : credentials.ca,
    ...(options.noCertificate ? {} : credentials[options.identity ?? 'reader']),
    rejectUnauthorized: true,
    ...options.tls,
  });
  t.after(() => {
    socket.destroy();
    stream.destroy();
  });
  socket.on('error', (error) => {
    failures.push(error.code);
    ws.terminate();
    stream.destroy();
  });
  return { socket, ws, received, wire, reverseWire, failures };
}

// An error/close is required. A timeout is a test failure, not rejection evidence.
function closed(socket) {
  if (socket.closed) return Promise.resolve();
  return new Promise((resolve) => socket.once('close', resolve));
}

test('mutual authentication and encrypted bidirectional data over plain WS', { timeout: 5000 }, async (t) => {
  const b = await bench(t);
  await once(b.socket, 'secureConnect');
  assert.equal(b.socket.authorized, true);
  assert.equal(b.socket.getProtocol(), 'TLSv1.2');
  assert.equal(b.socket.getCipher().standardName, 'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384');
  const response = once(b.socket, 'data');
  b.socket.write('reader-secret-request');
  assert.equal((await response)[0].toString(), 'ack:reader-secret-request');
  assert.deepEqual(b.received, ['reader-secret-request']);
  for (const plaintext of ['reader-secret-request', 'ack:reader-secret-request']) {
    assert.equal(Buffer.concat([...b.wire, ...b.reverseWire]).includes(Buffer.from(plaintext)), false);
  }
});

for (const [name, options] of [
  ['wrong server CA', { wrongCa: true }],
  ['wrong server hostname', { servername: 'attacker.invalid' }],
  ['missing reader certificate', { noCertificate: true }],
  ['forged reader certificate', { identity: 'forged' }],
  ['expired reader certificate', { identity: 'expired' }],
  ['CA-signed but unenrolled reader', { identity: 'unenrolled' }],
  ['revoked reader', { revoked: true }],
  ['TLS 1.1 downgrade', { tls: { minVersion: 'TLSv1.1', maxVersion: 'TLSv1.1' } }],
]) {
  test(`rejects ${name} before dispatching application data`, { timeout: 5000 }, async (t) => {
    const b = await bench(t, options);
    b.socket.on('secureConnect', () => b.socket.write('unauthorized-command'));
    await closed(b.socket);
    assert.deepEqual(b.received, []);
  });
}

test('rejects plaintext legacy JSON on the protected channel', { timeout: 5000 }, async (t) => {
  const b = await bench(t);
  const done = closed(b.socket);
  b.ws.send('{"event":"READER_AUTHENTICATE","token":"legacy"}');
  await done;
  assert.deepEqual(b.received, []);
  assert.ok(b.failures.length > 0);
});

test('rejects modified ciphertext', { timeout: 5000 }, async (t) => {
  const b = await bench(t);
  await once(b.socket, 'secureConnect');
  const originalSend = b.ws.send.bind(b.ws);
  b.ws.send = (data, ...args) => {
    const modified = Buffer.from(data);
    modified[modified.length - 1] ^= 1;
    return originalSend(modified, ...args);
  };
  const done = closed(b.socket);
  b.socket.write('tampered-command');
  await done;
  assert.deepEqual(b.received, []);
  assert.ok(b.failures.length > 0);
});

test('rejects replay in one session and across a fresh connection', { timeout: 5000 }, async (t) => {
  const first = await bench(t);
  await once(first.socket, 'secureConnect');
  const response = once(first.socket, 'data');
  first.socket.write('execute-once');
  await response;
  // Last client WS message is the encrypted application record after Finished.
  const record = first.wire.at(-1);
  assert.equal(record[0], 23, 'captured TLS application-data record');
  const firstClosed = closed(first.socket);
  first.ws.send(record);
  await firstClosed;
  assert.deepEqual(first.received, ['execute-once']);
  assert.ok(first.failures.length > 0);

  const next = await bench(t);
  await once(next.socket, 'secureConnect');
  const nextClosed = closed(next.socket);
  next.ws.send(record);
  await nextClosed;
  assert.deepEqual(next.received, []);
  assert.ok(next.failures.length > 0);
});
