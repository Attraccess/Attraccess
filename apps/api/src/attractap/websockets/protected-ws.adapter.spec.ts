import { EncryptionService } from '../../encryption/encryption.service';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { connect } from 'node:tls';
import { once, EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as migrations from '../../database/migrations';
import { constants, createPublicKey, sign, X509Certificate } from 'node:crypto';
import { createInterface } from 'node:readline';
import { encodeSignedReaderTime } from '../security/reader-time.service';
import * as forge from 'node-forge';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sendReaderSecurityCommand } from '../security/reader-security-cli';
import { Attractap, AttractapReaderIdentity, entities } from '@attraccess/database-entities';
import { WebSocket } from 'ws';
import { ReaderIdentityService } from '../security/reader-identity.service';
import { ReaderTimeService } from '../security/reader-time.service';
import { VerifiedCardSessionService } from '../security/verified-card-session.service';
import { readerSecurityFixture } from '../security/reader-security.test-fixture';
import { PROTECTED_READER_PATH, PROTECTED_READER_PROTOCOL, ProtectedWsAdapter } from './protected-ws.adapter';
import { ReaderCiphertextStream, ProtectedReaderSocket } from './reader-connection-transport';
import { encodeReaderFrame, ReaderFrameDecoder, ReaderFrameType } from './reader-frame';

describe('actual protected reader route over plain WS', () => {
  let fixture: ReturnType<typeof readerSecurityFixture>;
  beforeAll(() => {
    fixture = readerSecurityFixture();
  });
  afterAll(() => fixture.cleanup());

  (process.env.READER_SESSION_TEST_BINARY ? it : it.skip)(
    'production WebSocket owner retries a silent bootstrap peer with fresh challenges',
    async () => {
      writeFileSync(join(fixture.directory, 'enroll.pem'), fixture.read('reader.pem'), { mode: 0o600 });
      writeFileSync(
        join(fixture.directory, 'time-public.pem'),
        fixture.publicKey.export({ type: 'spki', format: 'pem' }),
        { mode: 0o600 },
      );
      const peer = spawn(process.env.READER_SESSION_TEST_BINARY, ['--wrapper'], {
        env: { ...process.env, READER_TEST_CERT_DIRECTORY: fixture.directory },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '',
        errors = '';
      peer.stdout.on('data', (bytes) => (output += bytes));
      peer.stderr.on('data', (bytes) => (errors += bytes));
      const [status] = await once(peer, 'exit');
      expect({ status, errors }).toEqual({ status: 0, errors: '' });
      expect(output).toContain('WRAPPER_OK');
    },
  );

  it('bootstraps time then exchanges framed JSON through mutually authenticated TLS', async () => {
    const http = createServer();
    const dbConfiguration = {
      type: 'sqlite' as const,
      database: join(fixture.directory, 'registry.sqlite'),
      entities: Object.values(entities),
      migrations: Object.values(migrations),
      migrationsRun: true,
      synchronize: false,
    };
    let source = await new DataSource(dbConfiguration).initialize();
    const configPath = join(fixture.directory, 'reader-security.json');
    const configuration = JSON.parse(readFileSync(configPath, 'utf8'));
    configuration.issuer = {
      caCertificateFile: join(fixture.directory, 'ca.pem'),
      caKeyFile: join(fixture.directory, 'ca.key'),
    };
    writeFileSync(configPath, JSON.stringify(configuration));
    await source.getRepository(Attractap).save({ id: 17, name: 'Persisted reader', apiTokenHash: 'legacy hash' });
    writeFileSync(
      join(fixture.directory, 'public.pem'),
      createPublicKey(fixture.read('reader.key')).export({ type: 'spki', format: 'pem' }),
      { mode: 0o600 },
    );
    writeFileSync(join(fixture.directory, 'manifest.json'), '{}', { mode: 0o600 });
    const createIdentities = () =>
      new ReaderIdentityService(
        source.getRepository(AttractapReaderIdentity),
        new ConfigService({ app: { READER_SECURITY_DIRECTORY: fixture.directory } }),
        new VerifiedCardSessionService(),
        new EncryptionService(new ConfigService()),
      );
    let identities = createIdentities();
    await identities.onModuleInit();
    const issueCommand = { command: 'issue', readerId: 17, publicKeyFile: join(fixture.directory, 'public.pem') };
    const first = (await sendReaderSecurityCommand(fixture.directory, issueCommand)) as { ok: boolean; result: string };
    expect(first.ok).toBe(true);
    expect(await source.getRepository(AttractapReaderIdentity).count()).toBe(0);
    const enroll = async (pem: string) => {
      writeFileSync(join(fixture.directory, 'enroll.pem'), pem, { mode: 0o600 });
      return identities.enroll({
        readerId: 17,
        certificateFile: join(fixture.directory, 'enroll.pem'),
        manifestFile: join(fixture.directory, 'manifest.json'),
        enrollmentClass: 'development',
      });
    };
    await enroll(first.result);
    const second = (await sendReaderSecurityCommand(fixture.directory, issueCommand)) as {
      ok: boolean;
      result: string;
    };
    expect(second.ok).toBe(true);
    expect(await enroll(second.result)).toMatchObject({ generation: 2 });
    const rows = await source.getRepository(AttractapReaderIdentity).find({ order: { generation: 'ASC' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].retiredAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(rows[0].publicKeyFingerprint).toBe(rows[1].publicKeyFingerprint);
    // Persist invalid newer generations with the same key. They must not
    // shadow generation two during startup or automatic time lookup.
    for (const [index, state] of ['expired', 'revoked', 'untrusted'].entries()) {
      const candidate = forge.pki.certificateFromPem(second.result);
      candidate.serialNumber = '01' + String(index + 1).repeat(36);
      if (state === 'expired') {
        candidate.validity.notBefore = new Date(Date.now() - 86400_000);
        candidate.validity.notAfter = new Date(Date.now() - 10000);
      }
      candidate.sign(
        forge.pki.privateKeyFromPem(fixture.read(state === 'untrusted' ? 'server.key' : 'ca.key').toString()),
        forge.md.sha256.create(),
      );
      const certificatePem = forge.pki.certificateToPem(candidate);
      const certificate = new X509Certificate(certificatePem);
      const original = { ...rows[1] };
      delete original.id;
      await source.getRepository(AttractapReaderIdentity).save({
        ...original,
        generation: index + 3,
        certificatePem,
        certificateFingerprint: certificate.fingerprint256.replace(/:/g, '').toLowerCase(),
        validFrom: new Date(certificate.validFrom),
        validUntil: new Date(certificate.validTo),
        revokedAt: state === 'revoked' ? new Date() : null,
      });
    }
    await identities.onModuleDestroy();
    await source.destroy();
    source = await new DataSource(dbConfiguration).initialize();
    identities = createIdentities();
    await identities.onModuleInit();
    expect((await identities.findForTime(fixture.identity.publicKeyFingerprint))?.generation).toBe(2);
    const adapter = new ProtectedWsAdapter(
      http as unknown as INestApplicationContext,
      identities,
      new ReaderTimeService(identities),
    );
    const gateway = adapter.create(0, { path: '/api/attractap/websocket' });
    const incoming = once(gateway, 'connection');
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const ws = new WebSocket(
      `ws://127.0.0.1:${(http.address() as AddressInfo).port}${PROTECTED_READER_PATH}`,
      PROTECTED_READER_PROTOCOL,
    );
    try {
      await once(ws, 'open');
      if (process.env.READER_SESSION_TEST_BINARY) {
        writeFileSync(
          join(fixture.directory, 'time-public.pem'),
          fixture.publicKey.export({ type: 'spki', format: 'pem' }),
          { mode: 0o600 },
        );
        const peer = spawn(process.env.READER_SESSION_TEST_BINARY, ['--owner'], {
          env: { ...process.env, READER_TEST_CERT_DIRECTORY: fixture.directory },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let discardedTimeRequests = 0;
        const messages = new EventEmitter();
        let output = '';
        let errors = '';
        peer.stderr.on('data', (bytes) => (errors += bytes.toString()));
        peer.stdout.on('data', (bytes) => {
          output += bytes.toString();
          while (output.includes('\n')) {
            const index = output.indexOf('\n');
            const line = output.slice(0, index);
            output = output.slice(index + 1);
            if (line.startsWith('WIRE ')) {
              const bytes = Buffer.from(line.slice(5), 'hex');
              if (bytes.length === 81 && discardedTimeRequests < 2) {
                discardedTimeRequests++;
                peer.stdin.write('OUTAGE\n');
              } else ws.send(bytes);
            } else if (line.startsWith('JSON ')) messages.emit('json', Buffer.from(line.slice(5), 'hex'));
            else if (line.startsWith('OTA ')) messages.emit('ota', Buffer.from(line.slice(4), 'hex'));
            // eslint-disable-next-line no-console -- Retain measured host allocation evidence in the test receipt.
            else if (line.startsWith('MEMORY ')) console.info(line);
            else if (line === 'READY') messages.emit('ready');
            else if (line === 'CLOSED') messages.emit('error', new Error('Firmware TLS peer closed'));
          }
        });
        peer.on('error', (error) => messages.emit('error', error));
        peer.on('exit', (code) => {
          if (code) messages.emit('error', new Error(`Firmware peer exit ${code}: ${errors}`));
        });
        ws.on('message', (bytes: Buffer, binary) => {
          if (!binary) messages.emit('error', new Error('Cleartext server message'));
          else peer.stdin.write('WIRE ' + bytes.toString('hex') + '\n');
        });
        try {
          await once(messages, 'ready');
          const [socket] = (await incoming) as [ProtectedReaderSocket];
          const heartbeat = Buffer.from(JSON.stringify({ event: 'HEARTBEAT' }));
          const inbound = once(socket, 'message');
          peer.stdin.write('SEND ' + heartbeat.toString('hex') + '\n');
          expect((await inbound)[0].data).toEqual(heartbeat);
          const response = once(messages, 'json');
          socket.send(JSON.stringify({ event: 'HEARTBEAT', serverTime: 123 }));
          expect(JSON.parse((await response)[0].toString())).toEqual({ event: 'HEARTBEAT', serverTime: 123 });
          if (process.env.READER_PAYLOAD_FIXTURE_DIR) {
            for (const name of ['empty', 'ten-descriptions', 'personalized', 'multibyte', 'escaped', 'flow-buttons']) {
              const body = readFileSync(join(process.env.READER_PAYLOAD_FIXTURE_DIR, name + '.json'));
              const received = once(messages, 'json');
              socket.send(body.toString('utf8'));
              const [plaintext] = (await received) as [Buffer];
              expect(plaintext).toEqual(body);
              if (process.env.READER_PAYLOAD_RECEIVED_DIR) {
                mkdirSync(process.env.READER_PAYLOAD_RECEIVED_DIR, { recursive: true, mode: 0o700 });
                writeFileSync(join(process.env.READER_PAYLOAD_RECEIVED_DIR, name + '.json'), plaintext, {
                  mode: 0o600,
                });
              }
            }
          }
          expect(discardedTimeRequests).toBe(2);
          const ota = once(messages, 'ota');
          const chunk = Buffer.alloc(4096, 0x5a);
          socket.send(chunk);
          expect((await ota)[0]).toEqual(chunk);
          const disconnected = once(ws, 'close');
          await identities.revoke(17);
          await disconnected;
          expect(await identities.findForTime(fixture.identity.publicKeyFingerprint)).toBeNull();
        } finally {
          peer.stdin.end('CLOSE\n');
          peer.kill();
        }
        return;
      }

      const time = once(ws, 'message');
      ws.send(fixture.request());
      const [reply] = await time;
      expect(reply).toHaveLength(493);
      const stream = new ReaderCiphertextStream(ws);
      ws.on('message', (bytes: Buffer, binary: boolean) => {
        if (!binary) throw new Error('cleartext');
        stream.receive(bytes);
      });
      const tls = connect({
        socket: stream,
        servername: 'localhost',
        ca: fixture.read('ca.pem'),
        cert: second.result,
        key: fixture.read('reader.key'),
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
        sigalgs: 'rsa_pkcs1_sha256:rsa_pkcs1_sha384:rsa_pkcs1_sha512',
        rejectUnauthorized: true,
      });
      await once(tls, 'secureConnect');
      const [socket] = (await incoming) as [ProtectedReaderSocket];
      expect(tls.authorized).toBe(true);
      expect(tls.isSessionReused()).toBe(false);
      expect(tls.getCipher().name).toBe('ECDHE-RSA-AES256-GCM-SHA384');
      const received = once(socket, 'message');
      const message = Buffer.from(JSON.stringify({ event: 'HEARTBEAT' }));
      const frame = encodeReaderFrame(ReaderFrameType.Json, message);
      for (let index = 0; index < frame.length; index++) tls.write(frame.subarray(index, index + 1));
      expect((await received)[0].data).toEqual(message);
      const plaintext = new Promise<Buffer>((resolve) => {
        const decoder = new ReaderFrameDecoder((type, bytes) => {
          expect(type).toBe(ReaderFrameType.Json);
          resolve(Buffer.from(bytes));
        });
        tls.on('data', (bytes) => decoder.push(bytes));
      });
      socket.send(JSON.stringify({ event: 'HEARTBEAT', serverTime: 123 }));
      expect(JSON.parse((await plaintext).toString())).toEqual({ event: 'HEARTBEAT', serverTime: 123 });
      const disconnected = once(ws, 'close');
      await identities.revoke(17);
      await disconnected;
      tls.destroy();
      await expect(identities.findForTime(fixture.identity.publicKeyFingerprint)).resolves.toBeNull();
      await expect(new ReaderTimeService(identities).reply(fixture.request(), 'after-revoke')).rejects.toThrow(
        'denied',
      );
    } finally {
      ws.terminate();
      await adapter.close(gateway);
      await adapter.dispose();
      await identities.onModuleDestroy();
      await source.destroy();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }, 30_000);
});

// Real database and Node TLS negatives. Software signing keys cannot qualify DS hardware.
describe('protected route rejection before application dispatch', () => {
  let fixture: ReturnType<typeof readerSecurityFixture>;
  let source: DataSource;
  let identities: ReaderIdentityService;
  let http: ReturnType<typeof createServer>;
  let adapter: ProtectedWsAdapter;
  let gateway: ReturnType<ProtectedWsAdapter['create']>;
  let url: string;
  let dispatch: jest.Mock;
  const clients: WebSocket[] = [];

  beforeAll(() => {
    fixture = readerSecurityFixture();
  });
  afterAll(() => fixture.cleanup());
  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
      migrationsRun: true,
    }).initialize();
    await source.getRepository(Attractap).save({ id: 17, name: 'Negative fixture', apiTokenHash: 'unused' });
    await source.getRepository(AttractapReaderIdentity).save({ ...fixture.identity });
    identities = new ReaderIdentityService(
      source.getRepository(AttractapReaderIdentity),
      new ConfigService({ app: { READER_SECURITY_DIRECTORY: fixture.directory } }),
      new VerifiedCardSessionService(),
      new EncryptionService(new ConfigService()),
    );
    http = createServer();
    adapter = new ProtectedWsAdapter(
      http as unknown as INestApplicationContext,
      identities,
      new ReaderTimeService(identities),
    );
    gateway = adapter.create(0, { path: '/api/attractap/websocket' });
    dispatch = jest.fn();
    gateway.on('connection', dispatch);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}${PROTECTED_READER_PATH}`;
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) client.terminate();
    await adapter.close(gateway);
    await adapter.dispose();
    await source.destroy();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });
  async function open() {
    const ws = new WebSocket(url, PROTECTED_READER_PROTOCOL);
    clients.push(ws);
    await once(ws, 'open');
    return ws;
  }

  it.each(['time', 'tls'] as const)(
    'closes a silent %s phase at its deadline and releases admission for reconnect',
    async (phase) => {
      const timeouts: Array<{ callback: () => void; delay: number }> = [];
      const original = global.setTimeout;
      const timer = jest.spyOn(global, 'setTimeout').mockImplementation(((callback, delay, ...args) => {
        if (delay === 30000 || delay === 5000) timeouts.push({ callback: () => callback(...args), delay });
        return original(callback, delay, ...args);
      }) as typeof setTimeout);
      try {
        const ws = await open();
        if (phase === 'tls') {
          const reply = once(ws, 'message');
          ws.send(fixture.request());
          await reply;
        }
        const closed = once(ws, 'close');
        expect(timeouts.at(-1)?.delay).toBe(30000);
        timeouts.at(-1).callback();
        await closed;
        expect(dispatch).not.toHaveBeenCalled();
        expect(adapter['pending']).toBe(0);
        const next = await open();
        expect(next.readyState).toBe(WebSocket.OPEN);
      } finally {
        timer.mockRestore();
      }
    },
  );

  it('closes inactive authenticated traffic and stale cleanup cannot close a reconnected generation', async () => {
    let watchdog: () => Promise<void>;
    const original = global.setInterval;
    const interval = jest.spyOn(global, 'setInterval').mockImplementation(((callback, delay, ...args) => {
      if (delay === 1000) watchdog = () => callback(...args);
      return original(callback, delay, ...args);
    }) as typeof setInterval);
    const connectReader = async () => {
      const ws = await open();
      const time = once(ws, 'message');
      ws.send(fixture.request());
      await time;
      const stream = new ReaderCiphertextStream(ws);
      stream.on('error', () => undefined);
      ws.on('message', (bytes: Buffer) => stream.receive(bytes));
      const incoming = once(gateway, 'connection');
      const tls = connect({
        socket: stream,
        servername: 'localhost',
        ca: fixture.read('ca.pem'),
        cert: fixture.read('reader.pem'),
        key: fixture.read('reader.key'),
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
        sigalgs: 'rsa_pkcs1_sha256:rsa_pkcs1_sha384:rsa_pkcs1_sha512',
        rejectUnauthorized: true,
      });
      tls.on('error', () => undefined);
      await once(tls, 'secureConnect');
      const [application] = (await incoming) as [ProtectedReaderSocket];
      return { ws, tls, application };
    };
    try {
      const old = await connectReader();
      old.application.lastAuthenticatedInput = performance.now() - 60000;
      const closed = once(old.ws, 'close');
      await watchdog();
      await closed;
      const next = await connectReader();
      const generation = next.application.connection.generation;
      old.application.close();
      expect(next.application.connection.ready).toBe(true);
      expect(next.application.connection.generation).toBe(generation);
      const message = once(next.application, 'message');
      next.tls.write(encodeReaderFrame(ReaderFrameType.Json, Buffer.from('{"event":"HEARTBEAT"}')));
      expect((await message)[0].data.toString()).toBe('{"event":"HEARTBEAT"}');
      next.application.close();
    } finally {
      interval.mockRestore();
    }
  });

  it.each(['text', 'version', 'bootstrap-cap', 'ws-cap', 'fragmented-cap'])(
    'rejects %s without dispatch',
    async (kind) => {
      const ws = await open();
      const closed = once(ws, 'close');
      if (kind === 'text') ws.send('{}');
      else if (kind === 'version') {
        const request = fixture.request();
        request[0] = 0;
        ws.send(request);
      } else if (kind === 'bootstrap-cap') ws.send(Buffer.alloc(641));
      else if (kind === 'ws-cap') ws.send(Buffer.alloc(4097));
      else {
        ws.send(Buffer.alloc(2048), { fin: false });
        ws.send(Buffer.alloc(2049), { fin: true });
      }
      await closed;
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('admits only 16 pending peers and releases capacity on disconnect', async () => {
    for (let index = 0; index < 16; index++) await open();
    const excess = new WebSocket(url, PROTECTED_READER_PROTOCOL);
    clients.push(excess);
    await once(excess, 'close');
    const first = clients[0];
    const released = once(first, 'close');
    first.close();
    await released;
    const replacement = await open();
    // A WS ping confirms the replacement survived admission without granting app access.
    const pong = once(replacement, 'pong');
    replacement.ping();
    await pong;
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(['tamper', 'replay', 'apdu', 'truncated'])(
    'never dispatches invalid %s application traffic',
    async (kind) => {
      const ws = await open();
      const reply = once(ws, 'message');
      ws.send(fixture.request());
      await reply;
      class CapturingStream extends ReaderCiphertextStream {
        captured?: Buffer;
        tamper = false;
        _write(bytes: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
          this.captured = Buffer.from(bytes);
          const sent = Buffer.from(bytes);
          if (this.tamper) sent[sent.length - 1] ^= 1;
          super._write(sent, encoding, callback);
        }
      }
      const stream = new CapturingStream(ws);
      stream.on('error', () => undefined);
      ws.on('message', (bytes: Buffer) => stream.receive(bytes));
      const connected = once(gateway, 'connection');
      const tls = connect({
        socket: stream,
        servername: 'localhost',
        ca: fixture.read('ca.pem'),
        cert: fixture.identity.certificatePem,
        key: fixture.read('reader.key'),
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
        rejectUnauthorized: true,
      });
      tls.on('error', () => ws.terminate());
      try {
        await once(tls, 'secureConnect');
        const [application] = (await connected) as [ProtectedReaderSocket];
        const messages = jest.fn();
        application.on('message', messages);
        const closed = once(ws, 'close');
        const frame = encodeReaderFrame(ReaderFrameType.Json, Buffer.from('{"event":"HEARTBEAT"}'));
        if (kind === 'tamper') {
          stream.tamper = true;
          tls.write(frame);
        } else if (kind === 'replay') {
          const received = once(application, 'message');
          tls.write(frame);
          await received;
          ws.send(stream.captured);
        } else if (kind === 'apdu') {
          frame[1] = ReaderFrameType.Apdu;
          tls.write(frame);
        } else {
          await new Promise<void>((resolve) => tls.write(frame.subarray(0, 9), () => resolve()));
          ws.close();
        }
        await closed;
        expect(messages).toHaveBeenCalledTimes(kind === 'replay' ? 1 : 0);
      } finally {
        tls.destroy();
        stream.destroy();
      }
    },
  );

  it.each([
    'wrong-name',
    'wrong-trust',
    'unenrolled',
    'expired',
    'future',
    'wrong-usage',
    'weak-signature',
    'forged',
    'revoked',
    'wrong-installation',
    'tls-downgrade',
  ])(
    'rejects %s in the actual time/TLS route',
    async (kind) => {
      const ws = await open();
      const reply = once(ws, 'message');
      ws.send(fixture.request());
      expect((await reply)[0]).toHaveLength(493);
      let cert = fixture.identity.certificatePem;
      if (['unenrolled', 'expired', 'future', 'wrong-usage', 'weak-signature', 'forged'].includes(kind)) {
        const candidate = forge.pki.certificateFromPem(cert);
        candidate.serialNumber = '02' + '12'.repeat(18);
        if (kind === 'expired') {
          candidate.validity.notBefore = new Date(Date.now() - 86400000);
          candidate.validity.notAfter = new Date(Date.now() - 1000);
        }
        if (kind === 'future') {
          candidate.validity.notBefore = new Date(Date.now() + 86400000);
          candidate.validity.notAfter = new Date(Date.now() + 172800000);
        }
        if (kind === 'wrong-usage')
          candidate.setExtensions([
            { name: 'basicConstraints', cA: false },
            { name: 'extKeyUsage', serverAuth: true },
          ]);
        candidate.sign(
          forge.pki.privateKeyFromPem(fixture.read(kind === 'forged' ? 'server.key' : 'ca.key').toString()),
          kind === 'weak-signature' ? forge.md.sha1.create() : forge.md.sha256.create(),
        );
        cert = forge.pki.certificateToPem(candidate);
      }
      if (kind === 'revoked')
        await source.getRepository(AttractapReaderIdentity).update(fixture.identity.id, { revokedAt: new Date() });
      if (kind === 'wrong-installation')
        await source
          .getRepository(AttractapReaderIdentity)
          .update(fixture.identity.id, { installationId: '00000000-0000-4000-8000-000000000002' });
      const closed = once(ws, 'close');
      const stream = new ReaderCiphertextStream(ws);
      stream.on('error', () => undefined);
      ws.on('message', (bytes: Buffer) => stream.receive(bytes));
      const tls = connect({
        socket: stream,
        servername: kind === 'wrong-name' ? 'invalid.example' : 'localhost',
        ca: fixture.read(kind === 'wrong-trust' ? 'reader.pem' : 'ca.pem'),
        cert,
        key: fixture.read('reader.key'),
        minVersion: kind === 'tls-downgrade' ? 'TLSv1.1' : 'TLSv1.2',
        maxVersion: kind === 'tls-downgrade' ? 'TLSv1.1' : 'TLSv1.2',
        ciphers: kind === 'weak-signature' ? 'ECDHE-RSA-AES256-GCM-SHA384:@SECLEVEL=0' : 'ECDHE-RSA-AES256-GCM-SHA384',
        rejectUnauthorized: true,
      });
      tls.on('error', () => {
        ws.terminate();
      });
      try {
        await closed;
        expect(dispatch).not.toHaveBeenCalled();
      } finally {
        tls.destroy();
        stream.destroy();
      }
    },
    10000,
  );
});

const firmwareTimeTest = process.env.READER_SESSION_TEST_BINARY ? it : it.skip;
firmwareTimeTest(
  'production firmware time verifier rejects changed bindings, replay and late replies',
  async () => {
    const fixture = readerSecurityFixture();
    writeFileSync(join(fixture.directory, 'enroll.pem'), fixture.identity.certificatePem, { mode: 0o600 });
    writeFileSync(
      join(fixture.directory, 'time-public.pem'),
      fixture.publicKey.export({ type: 'spki', format: 'pem' }),
      { mode: 0o600 },
    );
    const peer = spawn(process.env.READER_SESSION_TEST_BINARY, ['--time'], {
      env: { ...process.env, READER_TEST_CERT_DIRECTORY: fixture.directory },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = createInterface({ input: peer.stdout })[Symbol.asyncIterator]();
    const next = async () => (await lines.next()).value as string;
    const privateKey = JSON.parse(fixture.read('time.json').toString()).keys[0].pem;
    const begin = async () => {
      peer.stdin.write('BEGIN\n');
      const line = await next();
      expect(line.startsWith('REQUEST ')).toBe(true);
      return Buffer.from(line.slice(8), 'hex');
    };
    const encode = (request: Buffer, saltLength = 32) => {
      const body = encodeSignedReaderTime({
        keyId: 1,
        installationId: fixture.identity.installationId,
        fingerprint: fixture.identity.publicKeyFingerprint,
        challenge: request.subarray(49),
        seconds: BigInt(Math.floor(Date.now() / 1000)),
      });
      return Buffer.concat([
        body,
        sign('sha256', body, { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength }),
      ]);
    };
    const accept = async (reply: Buffer, result: string) => {
      peer.stdin.write('ACCEPT ' + reply.toString('hex') + '\n');
      expect(await next()).toBe(result);
    };
    try {
      const first = await begin();
      const valid = encode(first);
      await accept(valid, 'ACCEPTED');
      peer.stdin.write('UNSIGNED\n');
      expect(await next()).toBe('ISOLATED');
      await accept(valid, 'DENIED');
      const second = await begin();
      expect(second.subarray(49)).not.toEqual(first.subarray(49));
      await accept(valid, 'DENIED');
      // Every domain, version, key, installation, reader, challenge, time and signature binding.
      for (const offset of [0, 16, 17, 21, 37, 69, 101, 109]) {
        const request = await begin();
        const altered = encode(request);
        altered[offset] ^= 1;
        await accept(altered, 'DENIED');
        // A failed attempt consumes its challenge as well.
        await accept(encode(request), 'DENIED');
      }
      await accept(encode(await begin(), 20), 'DENIED');
      await accept(encode(await begin()).subarray(0, 492), 'DENIED');
      const late = encode(await begin());
      peer.stdin.write('EXPIRE\n');
      await accept(late, 'DENIED');
      await accept(encode(await begin()), 'ACCEPTED');
    } finally {
      peer.stdin.end('CLOSE\n');
      peer.kill();
      fixture.cleanup();
    }
  },
  15000,
);
