import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { WebSocket, WebSocketServer } from 'ws';
import { HandshakeLimiter } from './handshake-limiter';
import { PeerIdentity, SessionConnection, SessionDecision, SessionError } from './session-connection';
import { FrameType, MAX_MESSAGE_BYTES, SESSION_SUBPROTOCOL } from './session-framing';
import { EmulatedReader } from './testing/emulated-reader';
import { TestInstallation, createTestInstallation, createTestReader } from './testing/test-pki';

const SLOW_READER = 20;

describe('SessionConnection', () => {
  let http: Server;
  let wss: WebSocketServer;
  let url: string;
  let installation: TestInstallation;
  let otherInstallation: TestInstallation;
  let limiter: HandshakeLimiter;
  const known = new Map<string, number>();
  const outcomes: Array<Promise<unknown>> = [];
  const connections: SessionConnection[] = [];
  const readers: EmulatedReader[] = [];

  const authorize = async (peer: PeerIdentity): Promise<SessionDecision> => {
    if (peer.readerId === SLOW_READER) await new Promise((r) => setTimeout(r, 300));
    if (!peer.chainValid || peer.readerId === null)
      return { kind: 'reject', reason: `chain ${peer.authorizationError} ${peer.readerId}` };
    if (known.get(peer.spkiFingerprint) !== peer.readerId) return { kind: 'reject', reason: 'unknown credential' };
    return { kind: 'reader', readerId: peer.readerId, certificateNotAfter: peer.certificateNotAfter };
  };

  beforeAll(async () => {
    installation = await createTestInstallation('inst-a');
    otherInstallation = await createTestInstallation('inst-b');
    http = createServer();
    wss = new WebSocketServer({
      server: http,
      handleProtocols: (protocols) => (protocols.has(SESSION_SUBPROTOCOL) ? SESSION_SUBPROTOCOL : false),
    });
    wss.on('connection', (ws) => {
      const connection = new SessionConnection(ws, limiter);
      connections.push(connection);
      outcomes.push(
        connection
          .handshake(async () => installation.server, authorize)
          .then((decision) => {
            connection.on('message', (frame) => connection.sendFrame(frame.type, frame.payload));
            return decision;
          })
          .catch((error: SessionError) => error),
      );
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/`;
  });

  beforeEach(() => {
    limiter = new HandshakeLimiter();
    outcomes.length = 0;
  });

  afterEach(() => {
    readers.splice(0).forEach((r) => r.close());
    connections.splice(0).forEach((c) => c.close());
  });

  afterAll(async () => {
    wss.close();
    await new Promise((resolve) => http.close(resolve));
  });

  async function pairedReader(id = 1) {
    const identity = await createTestReader(installation, id);
    known.set(identity.fingerprint, id);
    const reader = new EmulatedReader({ url, identity });
    readers.push(reader);
    return { identity, reader };
  }

  it('exchanges messages in both directions over TLS 1.3 with a full handshake each time', async () => {
    const { reader } = await pairedReader();
    await reader.connect();
    expect((reader.tls as NonNullable<typeof reader.tls>).getProtocol()).toBe('TLSv1.3');
    expect(['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384']).toContain(
      (reader.tls as NonNullable<typeof reader.tls>).getCipher().name,
    );
    expect((reader.tls as NonNullable<typeof reader.tls>).isSessionReused()).toBe(false);

    reader.send(FrameType.JSON, '{"event":"HEARTBEAT"}');
    const echoed = await reader.nextFrame();
    expect(echoed.type).toBe(FrameType.JSON);
    expect(echoed.payload.toString()).toBe('{"event":"HEARTBEAT"}');
    expect(await outcomes[0]).toMatchObject({ kind: 'reader', readerId: 1 });
  });

  it('does not put plaintext on the wire', async () => {
    const { reader } = await pairedReader();
    const seen: Buffer[] = [];
    await reader.connect();
    (reader.ws as NonNullable<typeof reader.ws>).on('message', (data: Buffer) => seen.push(Buffer.from(data)));
    reader.send(FrameType.JSON, '{"secret":"sentinel-plaintext"}');
    await reader.nextFrame();
    expect(Buffer.concat(seen).includes('sentinel-plaintext')).toBe(false);
  });

  it('carries a maximum-size message and rejects larger ones', async () => {
    const { reader } = await pairedReader();
    await reader.connect();
    reader.send(FrameType.BINARY, Buffer.alloc(MAX_MESSAGE_BYTES, 7));
    expect((await reader.nextFrame(() => true, 5000)).payload.length).toBe(MAX_MESSAGE_BYTES);

    // Hand-craft a header announcing an oversized message.
    const header = Buffer.alloc(5);
    header.writeUInt8(FrameType.BINARY, 0);
    header.writeUInt32BE(MAX_MESSAGE_BYTES + 1, 1);
    (reader.tls as NonNullable<typeof reader.tls>).write(header);
    await reader.closed;
  });

  it.each([
    ['a different CA', async () => createTestReader(installation, 3, { signer: otherInstallation })],
    [
      'an expired certificate',
      async () => createTestReader(installation, 3, { validityMs: 1000, now: new Date(Date.now() - 3600_000) }),
    ],
  ])('rejects a reader with %s', async (_name, make) => {
    const identity = await make();
    known.set(identity.fingerprint, 3);
    const reader = new EmulatedReader({ url, identity });
    readers.push(reader);
    await reader.connect().catch(() => undefined);
    await reader.closed;
    expect(await outcomes[0]).toBeInstanceOf(SessionError);
  });

  it('rejects an unknown (never paired) and a revoked credential', async () => {
    const { identity, reader } = await pairedReader(4);
    known.delete(identity.fingerprint);
    await reader.connect().catch(() => undefined);
    await reader.closed;
    expect(await outcomes[0]).toMatchObject({ reason: 'rejected' });
  });

  it('is refused by the reader when the installation ID or the CA is wrong', async () => {
    const identity = await createTestReader(installation, 5);
    known.set(identity.fingerprint, 5);
    const wrongId = new EmulatedReader({ url, identity: { ...identity, installationId: 'someone-else' } });
    readers.push(wrongId);
    await expect(wrongId.connect()).rejects.toBeDefined();

    const wrongCa = new EmulatedReader({ url, identity: { ...identity, caCertificatePem: otherInstallation.caPem } });
    readers.push(wrongCa);
    await expect(wrongCa.connect()).rejects.toBeDefined();
  });

  it('refuses TLS 1.2', async () => {
    const { identity } = await pairedReader(6);
    const reader = new EmulatedReader({ url, identity, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' });
    readers.push(reader);
    await expect(reader.connect()).rejects.toBeDefined();
  });

  it('closes the connection on a text frame', async () => {
    const { reader } = await pairedReader(7);
    await reader.connect();
    (reader.ws as NonNullable<typeof reader.ws>).send('{"event":"EVENT"}');
    await reader.closed;
  });

  it('closes the connection on tampered ciphertext', async () => {
    const { reader } = await pairedReader(8);
    await reader.connect();
    reader.send(FrameType.JSON, '{}');
    await reader.nextFrame();
    // Flip one bit of the next encrypted record on its way out.
    const stream = reader.stream as unknown as { rawSend: (data: Buffer, ...rest: unknown[]) => void };
    const send = stream.rawSend;
    stream.rawSend = (data: Buffer, ...rest: unknown[]) => {
      const copy = Buffer.from(data);
      copy[copy.length - 1] ^= 0x01;
      send(copy, ...rest);
    };
    reader.send(FrameType.JSON, '{}');
    await reader.closed;
  });

  it('closes the connection when an encrypted record is replayed', async () => {
    const { reader } = await pairedReader(9);
    await reader.connect();
    const stream = reader.stream as unknown as { rawSend: (data: Buffer, ...rest: unknown[]) => void };
    const send = stream.rawSend;
    const sent: Buffer[] = [];
    stream.rawSend = (data: Buffer, ...rest: unknown[]) => {
      sent.push(Buffer.from(data));
      send(data, ...rest);
    };
    reader.send(FrameType.JSON, '{"n":1}');
    await reader.nextFrame();
    expect(sent.length).toBeGreaterThan(0);
    // The same ciphertext again: TLS sequence numbers make it fail authentication.
    send(sent[sent.length - 1], { binary: true }, () => undefined);
    await reader.closed;
  });

  it('never resumes a TLS session: every connection is a full handshake', async () => {
    const first = await pairedReader(10);
    await first.reader.connect();
    first.reader.send(FrameType.JSON, '{}');
    await first.reader.nextFrame();
    const again = new EmulatedReader({ url, identity: first.identity, session: first.reader.session ?? undefined });
    readers.push(again);
    await again.connect();
    expect((again.tls as NonNullable<typeof again.tls>).isSessionReused()).toBe(false);
  });

  it('drops a reader whose outgoing queue exceeds the per-reader limit', async () => {
    const { reader } = await pairedReader(11);
    await reader.connect();
    await outcomes[0];
    const connection = connections[0];
    const results: boolean[] = [];
    for (let i = 0; i < 64; i++) results.push(connection.sendFrame(FrameType.BINARY, Buffer.alloc(4096)));
    expect(results).toContain(false);
    expect(results.filter(Boolean).length).toBeLessThan(64);
    expect(connection.isOpen).toBe(false);
    await reader.closed;
  });

  it('keeps a reader that receives a few large messages back to back', async () => {
    const { reader } = await pairedReader(14);
    await reader.connect();
    await outcomes[0];
    const connection = connections[0];
    expect(connection.sendFrame(FrameType.JSON, Buffer.alloc(25_000, 0x20))).toBe(true);
    expect(connection.sendFrame(FrameType.JSON, Buffer.alloc(25_000, 0x20))).toBe(true);
    expect(connection.sendFrame(FrameType.JSON, Buffer.alloc(1_000, 0x20))).toBe(true);
    expect(connection.isOpen).toBe(true);
    for (let i = 0; i < 3; i++) await reader.nextFrame();
  });

  it('ends the session when TLS fails while authorization is still running', async () => {
    const { reader } = await pairedReader(SLOW_READER);
    await reader.connect();
    // Garbage instead of a TLS record, while the server is still authorizing.
    (reader.ws as NonNullable<typeof reader.ws>).send(Buffer.alloc(64, 0xff), { binary: true });
    expect(await outcomes[0]).toBeInstanceOf(SessionError);
    expect(connections[0].isOpen).toBe(false);
    await reader.closed;
  });

  it('gives up a queued handshake as soon as the connection closes', async () => {
    limiter = new HandshakeLimiter(1, 4);
    const held = await limiter.acquire();
    const { reader } = await pairedReader(12);
    void reader.connect().catch(() => undefined);
    for (let i = 0; i < 100 && limiter.queueDepth === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(limiter.queueDepth).toBe(1);
    reader.close();
    for (let i = 0; i < 100 && limiter.queueDepth > 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(limiter.queueDepth).toBe(0);
    expect(await outcomes[0]).toMatchObject({ reason: 'closed' });
    held();
  });

  it('does not give an idle connection a handshake slot', async () => {
    limiter = new HandshakeLimiter(1, 0);
    const idle = new WebSocket(url, SESSION_SUBPROTOCOL);
    idle.on('error', () => undefined);
    await new Promise((resolve) => idle.once('open', resolve));
    // The idle socket never sends a ClientHello, so the only slot stays free for a real reader.
    const { reader } = await pairedReader(13);
    await reader.connect();
    // With one slot and no queue, the reader would have been refused if the idle socket held it.
    expect(await outcomes[1]).toMatchObject({ kind: 'reader', readerId: 13 });
    idle.close();
  });

  it('refuses beyond the handshake queue and recovers afterwards', async () => {
    limiter = new HandshakeLimiter(1, 1);
    const held = await limiter.acquire();
    const waiting = limiter.acquire();
    await expect(limiter.acquire()).rejects.toThrow('queue full');
    held();
    (await waiting)();
    expect(limiter.activeCount).toBe(0);
    expect(limiter.queueDepth).toBe(0);
  });
});
