import { INestApplication } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { constants, generateKeyPairSync, sign } from 'crypto';
import { AddressInfo } from 'net';
import { createWsAdapter } from '../../common/text-frame-ws-adapter';
import { LicenseService } from '../../license/license.service';
import { FakeCredentialStore, FakeUnitOfWork } from '../attractap-fake-stores.test-fixture';
import { ResourceListService } from '../websockets/handlers/resource-list/resource-list.service';
import { gatewayProviders } from '../websockets/websocket.gateway.attractap-gateway.test-fixture';
import { CredentialRegistryService } from './credential-registry.service';
import type { EfuseReportService } from './efuse-report.service';
import { HandshakeLimiter } from './handshake-limiter';
import { conversionStateStubProvider } from './identity-upgrade-gate';
import { buildProofTuple } from './identity-upgrade-proof';
import { IdentityUpgradeService } from './identity-upgrade.service';
import { InstallationIdentityService } from './installation-identity.service';
import { PairingService } from './pairing.service';
import { READER_CERT_VALIDITY_MS, READER_URI_PREFIX, issueLeaf, spkiFingerprint } from './pki';
import { ReaderControlService, UPGRADED_CLOSE_DELAY_MS } from './reader-control.service';
import { ReaderSessionService } from './reader-session.service';
import { Frame, FrameType } from './session-framing';
import { SessionMetrics } from './session-metrics';
import { EmulatedReader, type EmulatedReaderIdentity } from './testing/emulated-reader';
import { TestInstallation, createTestInstallation, createTestReader } from './testing/test-pki';

/**
 * The identity upgrade end to end through the real gateway, with the real upgrade service and credential registry,
 * in the order the firmware sends its messages: READER_AUTHENTICATED, then READER_FIRMWARE_INFO, then the request.
 */
describe('identity upgrade through the real gateway', () => {
  jest.setTimeout(60_000);
  let app: INestApplication;
  let url: string;
  let installation: TestInstallation;
  const readers: EmulatedReader[] = [];
  const store = new FakeCredentialStore();
  const registry = new CredentialRegistryService(store, new FakeUnitOfWork());
  const efuse = { handle: jest.fn(async () => 'recorded') } as unknown as EfuseReportService;
  /** Lets a test hold READER_FIRMWARE_INFO back, as a busy gateway would. */
  let firmwareInfoDelayMs = 0;
  const attractapService = {
    updateLastReaderConnection: jest.fn().mockResolvedValue(undefined),
    findReaderById: jest.fn(async (id: number) => ({
      id,
      name: `reader-${id}`,
      pairingState: 'paired',
      resources: [],
    })),
    updateReaderFirmware: jest.fn(async () => {
      if (firmwareInfoDelayMs > 0) await new Promise((r) => setTimeout(r, firmwareInfoDelayMs));
    }),
    recordReaderBuild: jest.fn().mockResolvedValue(undefined),
  };
  const issueReaderCertificate = jest.fn(async (readerId: number, spki: Buffer) => {
    const cert = await issueLeaf({
      caCert: installation.ca.cert,
      caKey: installation.ca.keys.privateKey,
      subjectPublicKey: spki,
      commonName: `Attractap reader ${readerId}`,
      uri: `${READER_URI_PREFIX}${readerId}`,
      usage: 'client',
      validityMs: READER_CERT_VALIDITY_MS,
    });
    return { pem: cert.toString('pem'), serial: cert.serialNumber, notAfter: cert.notAfter };
  });

  beforeAll(async () => {
    installation = await createTestInstallation('inst-upgrade');
    const security = [
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
          issueReaderCertificate,
        },
      },
      { provide: CredentialRegistryService, useValue: registry },
      {
        provide: PairingService,
        useValue: { handleConnection: jest.fn(), resolveBootstrap: async () => null, forgetGrant: jest.fn() },
      },
      {
        provide: SessionMetrics,
        useValue: { activeSessions: { inc: jest.fn(), dec: jest.fn() }, handshakeFailures: { inc: jest.fn() } },
      },
      conversionStateStubProvider,
      IdentityUpgradeService,
      {
        provide: ReaderControlService,
        useFactory: (upgrades: IdentityUpgradeService) => new ReaderControlService(upgrades, efuse),
        inject: [IdentityUpgradeService],
      },
      ReaderSessionService,
    ];
    const module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
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
    url = `ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/attractap/websocket`;
  }, 30_000);

  beforeEach(() => {
    // The fixture's resource services are bare; an empty list keeps the sign-in from failing.
    jest.spyOn(app.get(ResourceListService), 'sendResourceListToSocket').mockResolvedValue(undefined);
  });
  afterEach(() => {
    readers.splice(0).forEach((r) => r.close());
    firmwareInfoDelayMs = 0;
    jest.restoreAllMocks();
  });
  afterAll(async () => app.close());

  const json = (frame: Frame) => JSON.parse(frame.payload.toString()) as Record<string, unknown>;
  const isControl = (t: string) => (f: Frame) => f.type === FrameType.CONTROL && json(f)['t'] === t;
  const isEvent = (type: string) => (f: Frame) =>
    f.type === FrameType.JSON && (json(f)['data'] as { type?: string } | undefined)?.type === type;
  const control = (reader: EmulatedReader, message: unknown) => reader.send(FrameType.CONTROL, JSON.stringify(message));
  const event = (reader: EmulatedReader, type: string, payload: unknown = {}) =>
    reader.send(FrameType.JSON, JSON.stringify({ event: 'EVENT', data: { type, payload } }));
  const firmwareInfo = (reader: EmulatedReader) =>
    event(reader, 'READER_FIRMWARE_INFO', {
      name: 'attractap',
      variant: 'attractap-touch-v2',
      version: '2.6.0',
      profile: 'secure-lab',
      release: false,
      secureVersion: 1,
      secured: false,
      identity: 'ecdsa-p256',
    });

  async function connect(identity: EmulatedReaderIdentity) {
    const reader = new EmulatedReader({ url, identity });
    readers.push(reader);
    await reader.connect();
    return reader;
  }

  /** A reader paired with a P-256 software key that also holds a (DS) RSA-3072 key. */
  async function pairedP256Reader(readerId: number) {
    const p256 = await createTestReader(installation, readerId);
    store.addReader({
      id: readerId,
      name: `reader-${readerId}`,
      pairingState: 'paired',
      credentialFingerprint: p256.fingerprint,
      certificateSerial: '01',
    });
    const ds = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 65537 });
    const dsSpki = ds.publicKey.export({ type: 'spki', format: 'der' });
    const proof = (nonceBase64: string) =>
      sign(
        'sha256',
        buildProofTuple({
          installationId: installation.installationId,
          readerId,
          oldFingerprint: Buffer.from(p256.fingerprint, 'hex'),
          newSpki: dsSpki,
          nonce: Buffer.from(nonceBase64, 'base64'),
        }),
        { key: ds.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      ).toString('base64');
    const upgradeMessage = (nonce: string) => ({
      t: 'identity.upgrade',
      spki: dsSpki.toString('base64'),
      proof: proof(nonce),
    });
    const dsIdentity = (certificatePem: string): EmulatedReaderIdentity => ({
      privateKeyPem: ds.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      certificatePem,
      caCertificatePem: installation.caPem,
      installationId: installation.installationId,
    });
    return { p256, dsSpki, upgradeMessage, dsIdentity };
  }

  /** Session start as the firmware sees it: hello, sign-in, the reader's acknowledgement. */
  async function signIn(reader: EmulatedReader) {
    await reader.nextFrame(isControl('session.hello'));
    await reader.nextFrame(isEvent('READER_AUTHENTICATED'));
    event(reader, 'ACK_READER_AUTHENTICATED');
  }

  /** The challenge, the proof, the certificate. Returns the certificate. */
  async function answerChallenge(reader: EmulatedReader, upgradeMessage: (nonce: string) => unknown) {
    const challenge = json(
      await reader.nextFrame((f) => f.type === FrameType.CONTROL && json(f)['t'] !== 'identity.recover'),
    );
    expect(challenge).toMatchObject({ t: 'identity.challenge' });
    control(reader, upgradeMessage(challenge['nonce'] as string));
    const done = json(await reader.nextFrame((f) => f.type === FrameType.CONTROL));
    expect(done).toMatchObject({ t: 'identity.upgraded', certificate: expect.stringContaining('BEGIN CERTIFICATE') });
    return done['certificate'] as string;
  }

  async function upgradeInSession(readerId: number) {
    const { p256, dsSpki, upgradeMessage, dsIdentity } = await pairedP256Reader(readerId);
    const session = await connect(p256);
    await signIn(session);
    firmwareInfo(session);
    control(session, { t: 'identity.upgrade.request' });
    const certificate = await answerChallenge(session, upgradeMessage);
    const upgradedAt = Date.now();
    await session.closed;
    return { p256, dsSpki, upgradeMessage, dsIdentity, certificate, closedAfterMs: Date.now() - upgradedAt };
  }

  it('upgrades a P-256 reader that asks after READER_FIRMWARE_INFO, then signs it in with the DS key', async () => {
    const { p256, dsSpki, dsIdentity, certificate, closedAfterMs } = await upgradeInSession(40);
    // The old key's session ends shortly after the reply left.
    expect(closedAfterMs).toBeGreaterThanOrEqual(UPGRADED_CLOSE_DELAY_MS - 100);
    expect(closedAfterMs).toBeLessThan(2_000);
    expect(store.rows.get(40)?.credentialFingerprint).toBe(spkiFingerprint(dsSpki));
    expect(store.events.filter((e) => e.readerId === 40).map((e) => [e.state, e.keyFingerprint, e.actorId])).toEqual([
      ['replaced', p256.fingerprint, null],
      ['paired', spkiFingerprint(dsSpki), null],
    ]);

    // The reader reconnects with its DS key and the new certificate (TLS 1.3 CertificateVerify with RSA-PSS).
    const ds = await connect(dsIdentity(certificate));
    await ds.nextFrame(isControl('session.hello'));
    await ds.nextFrame(isEvent('READER_AUTHENTICATED'));

    // The replaced key is no credential any more outside the recovery window's upgrade-only session.
    expect(await registry.isActive(40, p256.fingerprint)).toBe(false);
  });

  it('waits for READER_FIRMWARE_INFO when the request is processed before it', async () => {
    const { p256, dsSpki, upgradeMessage } = await pairedP256Reader(41);
    const session = await connect(p256);
    await signIn(session);
    firmwareInfoDelayMs = 300;
    // The request overtakes the firmware info: both channels are processed independently.
    control(session, { t: 'identity.upgrade.request' });
    firmwareInfo(session);
    await answerChallenge(session, upgradeMessage);
    expect(store.rows.get(41)?.credentialFingerprint).toBe(spkiFingerprint(dsSpki));
  });

  it('re-sends the certificate in an upgrade-only session of the replaced key, without a new history row', async () => {
    const { p256, dsSpki, upgradeMessage, dsIdentity } = await upgradeInSession(42);
    const rows = store.events.length;
    issueReaderCertificate.mockClear();

    // The reader lost the certificate: it comes back with its P-256 key.
    const recovery = await connect(p256);
    await recovery.nextFrame(isControl('identity.recover'));
    // Its keep-alive runs regardless of sign-in and does not end the session.
    recovery.send(FrameType.HEARTBEAT, Buffer.alloc(0));
    control(recovery, { t: 'identity.upgrade.request' });
    const certificate = await answerChallenge(recovery, upgradeMessage);
    expect(issueReaderCertificate).toHaveBeenCalledWith(42, dsSpki);
    expect(store.events).toHaveLength(rows);
    // Nothing of a normal session reached it.
    expect(recovery.frames.filter((f) => f.type === FrameType.JSON || isControl('session.hello')(f))).toEqual([]);

    const ds = await connect(dsIdentity(certificate));
    await ds.nextFrame(isEvent('READER_AUTHENTICATED'));
  });

  it('ends an upgrade-only session on an eFuse report or an application message', async () => {
    const { p256 } = await upgradeInSession(43);
    const withReport = await connect(p256);
    await withReport.nextFrame(isControl('identity.recover'));
    control(withReport, { t: 'efuse.report', mac: 'dc:b4:d9:21:71:c8' });
    await withReport.closed;
    expect(efuse.handle).not.toHaveBeenCalled();

    const withEvent = await connect(p256);
    await withEvent.nextFrame(isControl('identity.recover'));
    event(withEvent, 'READER_FIRMWARE_INFO', {});
    await withEvent.closed;
  });

  it('tells a key an admin replaced (takeover) that its credential is inactive, never offers recovery', async () => {
    const old = await createTestReader(installation, 44);
    store.addReader({ id: 44, name: 'reader-44', pairingState: 'paired', credentialFingerprint: old.fingerprint });
    const takeover = await createTestReader(installation, 44);
    await registry.markPaired({
      readerId: 44,
      fingerprint: takeover.fingerprint,
      certificate: { serial: '02', notAfter: new Date(Date.now() + 1e10) },
      actorId: 1,
      previousCredentialBecomes: 'replaced',
    });
    const reader = new EmulatedReader({ url, identity: old });
    readers.push(reader);
    await reader.connect().catch(() => undefined);
    await reader.closed;
    expect(reader.frames.map((f) => json(f))).toEqual([{ t: 'session.rejected', reason: 'inactive-credential' }]);
  });
});
