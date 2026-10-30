import { Attractap } from '@attraccess/database-entities';
import { INestApplication } from '@nestjs/common';
import { createWsAdapter } from '../../common/text-frame-ws-adapter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { LicenseService } from '../../license/license.service';
import { AttractapService } from '../attractap.service';
import { AttractapGateway } from '../websockets/websocket.gateway';
import { gatewayProviders } from '../websockets/websocket.gateway.attractap-gateway.test-fixture';
import { CredentialRegistryService } from './credential-registry.service';
import { HandshakeLimiter } from './handshake-limiter';
import { InstallationIdentityService } from './installation-identity.service';
import { PairingService } from './pairing.service';
import { ReaderSessionService } from './reader-session.service';
import { FrameType, SESSION_SUBPROTOCOL } from './session-framing';
import { SessionMetrics } from './session-metrics';
import { EmulatedReader } from './testing/emulated-reader';
import { TestInstallation, createTestInstallation, createTestReader } from './testing/test-pki';

describe('reader session through the real gateway', () => {
  let app: INestApplication;
  let gateway: AttractapGateway;
  let url: string;
  let installation: TestInstallation;
  const active = new Set<string>();
  const readers: EmulatedReader[] = [];
  const grants = new Map<string, { readerId: number; certificatePem: string; expiresAt: number }>();

  beforeAll(async () => {
    installation = await createTestInstallation('inst-gw');
    const attractapService = {
      updateLastReaderConnection: jest.fn().mockResolvedValue(undefined),
      findReaderById: jest.fn(async (id: number) => ({
        id,
        name: `reader-${id}`,
        pairingState: 'paired',
        resources: [],
      })),
    };
    const security = [
      { provide: getRepositoryToken(Attractap), useValue: { update: jest.fn() } },
      { provide: HandshakeLimiter, useFactory: () => new HandshakeLimiter() },
      {
        provide: InstallationIdentityService,
        useValue: {
          getServerTlsMaterial: async () => ({
            certificateChainPem: installation.server.certificateChainPem,
            privateKeyPem: installation.server.privateKeyPem,
          }),
          getCaCertificatePem: async () => installation.caPem,
          getInstallationId: async () => installation.installationId,
        },
      },
      {
        provide: CredentialRegistryService,
        useValue: { isActive: async (id: number, fp: string) => active.has(`${id}:${fp}`) },
      },
      {
        provide: PairingService,
        useValue: {
          handleConnection: jest.fn(),
          resolveBootstrap: async (peer: { spkiFingerprint: string }) => grants.get(peer.spkiFingerprint) ?? null,
          forgetGrant: jest.fn(),
        },
      },
      {
        provide: SessionMetrics,
        useValue: { activeSessions: { inc: jest.fn(), dec: jest.fn() }, handshakeFailures: { inc: jest.fn() } },
      },
      ReaderSessionService,
    ];
    const module = await Test.createTestingModule({
      providers: (
        gatewayProviders(
          attractapService,
          { verifyLicense: jest.fn().mockResolvedValue(undefined) } as unknown as LicenseService,
          security,
        ) as Array<{ provide?: { name?: string } }>
      ).map((provider) =>
        provider.provide?.name === 'SupervisionService'
          ? { ...provider, useValue: { setReaderArmer: jest.fn() } }
          : provider,
      ) as never,
    }).compile();
    app = module.createNestApplication();
    app.useWebSocketAdapter(createWsAdapter(app));
    await app.listen(0, '127.0.0.1');
    gateway = app.get(AttractapGateway);
    url = `ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/attractap/websocket`;
    void LicenseService;
    void AttractapService;
  }, 30_000);

  afterEach(() => readers.splice(0).forEach((r) => r.close()));
  afterAll(async () => app.close());

  async function connectPaired(readerId: number) {
    const identity = await createTestReader(installation, readerId);
    active.add(`${readerId}:${identity.fingerprint}`);
    const reader = new EmulatedReader({ url, identity });
    readers.push(reader);
    await reader.connect();
    return { reader, identity };
  }

  const json = (frame: { payload: Buffer }) => JSON.parse(frame.payload.toString());

  it('signs a paired reader in from its certificate and routes messages through the normal handlers', async () => {
    const { reader } = await connectPaired(5);

    const hello = await reader.nextFrame((f) => f.type === FrameType.CONTROL);
    expect(JSON.parse(hello.payload.toString())).toMatchObject({ t: 'session.hello', installationId: 'inst-gw' });

    const authenticated = await reader.nextFrame((f) => f.type === FrameType.JSON);
    expect(json(authenticated).data).toMatchObject({ type: 'READER_AUTHENTICATED' });
    reader.send(FrameType.JSON, JSON.stringify({ event: 'EVENT', data: { type: 'ACK_READER_AUTHENTICATED' } }));

    // A heartbeat goes through the real @SubscribeMessage handler and its reply comes back encrypted.
    reader.send(FrameType.HEARTBEAT, Buffer.alloc(0));
    const reply = await reader.nextFrame((f) => f.type === FrameType.JSON && json(f).event === 'HEARTBEAT');
    expect(json(reply).event).toBe('HEARTBEAT');
  });

  it.each(['READER_AUTHENTICATE', 'READER_REGISTER'])('closes the session on %s inside it', async (type) => {
    const { reader } = await connectPaired(type === 'READER_REGISTER' ? 16 : 6);
    await reader.nextFrame((f) => f.type === FrameType.JSON);
    reader.send(FrameType.JSON, JSON.stringify({ event: 'EVENT', data: { type, payload: { id: 6, token: 'x' } } }));
    await reader.closed;
  });

  it('never dispatches a JSON event injected as a raw binary frame into a session', async () => {
    const { reader } = await connectPaired(14);
    await reader.nextFrame((f) => f.type === FrameType.JSON);
    await new Promise((r) => setTimeout(r, 100));
    const handled = jest.spyOn(gateway as unknown as { clientWasActive: () => Promise<void> }, 'clientWasActive');
    try {
      // What an attacker on a plain ws:// path could add next to the TLS bytes.
      (reader.ws as WebSocket).send(Buffer.from(JSON.stringify({ event: 'HEARTBEAT', data: {} })), { binary: true });
      await reader.closed;
      await new Promise((r) => setTimeout(r, 100));
      expect(handled).not.toHaveBeenCalled();
    } finally {
      handled.mockRestore();
    }
  });

  it('closes a session on a plain text frame before any handler runs', async () => {
    const { reader } = await connectPaired(15);
    await reader.nextFrame((f) => f.type === FrameType.JSON);
    await new Promise((r) => setTimeout(r, 100));
    const handled = jest.spyOn(gateway as unknown as { clientWasActive: () => Promise<void> }, 'clientWasActive');
    try {
      (reader.ws as WebSocket).send(JSON.stringify({ event: 'HEARTBEAT', data: {} }));
      await reader.closed;
      await new Promise((r) => setTimeout(r, 100));
      expect(handled).not.toHaveBeenCalled();
    } finally {
      handled.mockRestore();
    }
  });

  it('ends the live session within a second when the credential is revoked', async () => {
    const { reader, identity } = await connectPaired(7);
    await reader.nextFrame((f) => f.type === FrameType.JSON);
    const started = Date.now();
    active.clear(); // what the registry reports once the credential is revoked
    await gateway.onCredentialChanged(7);
    await reader.closed;
    expect(Date.now() - started).toBeLessThan(1000);

    // Further handshakes with the revoked credential are refused.
    const again = new EmulatedReader({ url, identity });
    readers.push(again);
    await again.connect().catch(() => undefined);
    await again.closed;
    expect(again.frames.filter((f) => f.type === FrameType.JSON)).toHaveLength(0);
  });

  it('rejects a reader whose credential is not active', async () => {
    const identity = await createTestReader(installation, 8); // never registered as active
    const reader = new EmulatedReader({ url, identity });
    readers.push(reader);
    await reader.connect().catch(() => undefined);
    await reader.closed;
  });

  it('hands a freshly paired reader its certificate in a bootstrap session', async () => {
    const identity = await createTestReader(installation, 9);
    grants.set(identity.fingerprint, { readerId: 9, certificatePem: 'CERT-PEM', expiresAt: Date.now() + 60_000 });
    // The bootstrap reader presents a certificate the CA did not issue; here: one from another installation.
    const stranger = await createTestInstallation('other');
    const bootstrapIdentity = await createTestReader(stranger, 9);
    grants.set(bootstrapIdentity.fingerprint, {
      readerId: 9,
      certificatePem: 'CERT-PEM',
      expiresAt: Date.now() + 60_000,
    });
    const reader = new EmulatedReader({
      url,
      identity: {
        ...bootstrapIdentity,
        caCertificatePem: installation.caPem,
        installationId: installation.installationId,
      },
    });
    readers.push(reader);
    await reader.connect();
    const control = await reader.nextFrame((f) => f.type === FrameType.CONTROL);
    expect(JSON.parse(control.payload.toString())).toMatchObject({
      t: 'pairing.complete',
      readerId: 9,
      certificate: 'CERT-PEM',
    });
    // The grant is single-use.
    grants.delete(bootstrapIdentity.fingerprint);
  });

  it('does not renew an expired installation certificate through the bootstrap path', async () => {
    const expired = await createTestReader(installation, 17, {
      validityMs: 1000,
      now: new Date(Date.now() - 3600_000),
    });
    grants.set(expired.fingerprint, { readerId: 17, certificatePem: 'CERT-PEM', expiresAt: Date.now() + 60_000 });
    const reader = new EmulatedReader({ url, identity: expired });
    readers.push(reader);
    await reader.connect().catch(() => undefined);
    await reader.closed;
    expect(reader.frames).toHaveLength(0);
  });

  it('refuses unknown subprotocol versions at upgrade and still serves legacy connections', async () => {
    const unknown = new WebSocket(url, ['attractap-session.v2']);
    const status = await new Promise<number>((resolve) => {
      unknown.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      unknown.on('open', () => resolve(101));
      unknown.on('error', () => undefined);
    });
    expect(status).toBe(400);

    const legacy = new WebSocket(url);
    const first = await new Promise<string>((resolve) => legacy.once('message', (d) => resolve(d.toString())));
    expect(JSON.parse(first).data.type).toBe('READER_REQUEST_AUTHENTICATION');
    legacy.close();
    expect(SESSION_SUBPROTOCOL).toBe('attractap-session.v1');
  });
});
