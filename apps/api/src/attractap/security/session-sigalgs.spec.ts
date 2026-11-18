import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { connect as tlsConnect } from 'tls';
import { WebSocket, WebSocketServer } from 'ws';
import { HandshakeLimiter } from './handshake-limiter';
import { PeerIdentity, SessionConnection, SessionDecision, SessionError } from './session-connection';
import { SESSION_SUBPROTOCOL } from './session-framing';
import { TestInstallation, createTestInstallation, createTestRsaReader } from './testing/test-pki';
import { WsByteStream } from './ws-byte-stream';

/**
 * The reader's CertificateVerify algorithm and key size, seen from the server: RSA readers sign with RSA-PSS on an
 * RSA-3072 key, never PKCS#1 v1.5 and never another size. The client here sets its own signature algorithms, which
 * the emulated reader does not.
 */
describe('reader signature algorithms in the session handshake', () => {
  jest.setTimeout(30_000);
  let http: Server;
  let wss: WebSocketServer;
  let url: string;
  let installation: TestInstallation;
  const outcomes: Array<Promise<SessionDecision | SessionError>> = [];
  const authorized: PeerIdentity[] = [];
  const connections: SessionConnection[] = [];
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    installation = await createTestInstallation('inst-sigalgs');
    http = createServer();
    wss = new WebSocketServer({ server: http, handleProtocols: () => SESSION_SUBPROTOCOL });
    wss.on('connection', (ws) => {
      const connection = new SessionConnection(ws, new HandshakeLimiter());
      connections.push(connection);
      outcomes.push(
        connection
          .handshake(
            async () => installation.server,
            async (peer) => {
              authorized.push(peer);
              return { kind: 'reader', readerId: peer.readerId ?? 0, certificateNotAfter: peer.certificateNotAfter };
            },
          )
          .catch((error: SessionError) => error),
      );
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/`;
  });

  beforeEach(() => {
    outcomes.length = 0;
    authorized.length = 0;
  });

  afterEach(() => {
    sockets.splice(0).forEach((ws) => ws.close());
    connections.splice(0).forEach((connection) => connection.close());
  });

  afterAll(async () => {
    wss.close();
    await new Promise((resolve) => http.close(resolve));
  });

  /** A TLS 1.3 client inside the WebSocket that offers only the given signature algorithms. True: handshake done. */
  async function handshake(bits: number, sigalgs: string): Promise<boolean> {
    const identity = await createTestRsaReader(installation, 30, { bits });
    const ws = new WebSocket(url, [SESSION_SUBPROTOCOL]);
    sockets.push(ws);
    ws.on('error', () => undefined);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    const stream = new WsByteStream(ws, 1024 * 1024);
    ws.on('message', (data: Buffer, isBinary: boolean) => isBinary && stream.feed(Buffer.from(data)));
    ws.on('close', () => stream.destroy());
    const tls = tlsConnect({
      socket: stream,
      key: identity.privateKeyPem,
      cert: identity.certificatePem,
      ca: identity.caCertificatePem,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      ecdhCurve: 'prime256v1',
      sigalgs,
      checkServerIdentity: () => undefined,
    });
    tls.on('error', () => undefined);
    const established = await new Promise<boolean>((resolve) => {
      tls.once('secureConnect', () => resolve(true));
      tls.once('close', () => resolve(false));
    });
    // A TLS 1.3 client finishes before the server read its certificate; the server's verdict is the outcome.
    await outcomes[0];
    return established;
  }

  it('accepts an RSA-3072 reader that signs with rsa_pss_rsae_sha256', async () => {
    await handshake(3072, 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256');
    expect(await outcomes[0]).toMatchObject({ kind: 'reader', readerId: 30 });
    expect(authorized).toHaveLength(1);
  });

  it('refuses an RSA-3072 reader that can only sign with PKCS#1 v1.5 (rsa_pkcs1_sha256)', async () => {
    // ECDSA stays offered so the server can still sign its own CertificateVerify.
    await handshake(3072, 'ecdsa_secp256r1_sha256:rsa_pkcs1_sha256');
    const outcome = await outcomes[0];
    expect(outcome).toBeInstanceOf(SessionError);
    expect(authorized).toEqual([]);
  });

  it('refuses a CA-certified RSA-2048 reader key as an unsupported key, before authorization', async () => {
    await handshake(2048, 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256');
    const outcome = await outcomes[0];
    expect(outcome).toBeInstanceOf(SessionError);
    expect(outcome).toMatchObject({ reason: 'rejected', message: 'unsupported-key' });
    expect(authorized).toEqual([]);
  });
});
