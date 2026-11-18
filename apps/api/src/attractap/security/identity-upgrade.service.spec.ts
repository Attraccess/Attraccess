import { ConflictException, Logger } from '@nestjs/common';
import { constants, createHash, generateKeyPairSync, sign, type KeyObject } from 'crypto';
import { validAttractapDetails } from '../../audit/policies/attractap';
import { FakeCredentialStore, FakeUnitOfWork } from '../attractap-fake-stores.test-fixture';
import { CredentialRegistryService } from './credential-registry.service';
import { isIdentityUpgradeAllowed, readerConversionState } from './identity-upgrade-gate';
import { buildProofTuple, type ProofFields } from './identity-upgrade-proof';
import {
  IdentityUpgradeService,
  NONCE_TTL_MS,
  RECOVERY_WINDOW_MS,
  type IdentityUpgradeSession,
  type UpgradeMode,
} from './identity-upgrade.service';
import { spkiFingerprint } from './pki';
import { SessionSecurityState, type ReportedBuild } from './session-security-state';

const INSTALLATION = 'installation-1';
const lab: ReportedBuild = { profile: 'secure-lab', release: false, variant: 'attractap-touch-v2', secureVersion: 1 };
const rsaKey = () => generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 65537 });
const spkiOf = (key: KeyObject) => key.export({ type: 'spki', format: 'der' });

describe('identity upgrade', () => {
  jest.setTimeout(30_000);
  const ds = rsaKey(); // the DS key of the reader
  const dsSpki = spkiOf(ds.publicKey);
  const other = rsaKey();
  const oldFingerprint = spkiFingerprint(Buffer.from('p256-spki'));

  let store: FakeCredentialStore;
  let registry: CredentialRegistryService;
  let audit: { record: jest.Mock };
  let identity: { getInstallationId: jest.Mock; issueReaderCertificate: jest.Mock };
  let service: IdentityUpgradeService;

  beforeEach(() => {
    store = new FakeCredentialStore();
    store.addReader({
      id: 7,
      name: 'reader-7',
      pairingState: 'paired',
      credentialFingerprint: oldFingerprint,
      certificateSerial: '01',
    });
    registry = new CredentialRegistryService(store, new FakeUnitOfWork());
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    identity = {
      getInstallationId: jest.fn().mockResolvedValue(INSTALLATION),
      issueReaderCertificate: jest.fn(async (_id: number, spki: Buffer) => ({
        pem: `-----CERT ${spkiFingerprint(spki).slice(0, 8)}-----`,
        serial: '0b',
        notAfter: new Date(Date.now() + 1e10),
      })),
    };
    service = new IdentityUpgradeService(identity as never, registry, audit);
  });

  const session = (
    build: ReportedBuild | null = lab,
    algorithm: 'ecdsa-p256' | 'rsa-3072' = 'ecdsa-p256',
    mode: UpgradeMode = 'session',
    fingerprint = oldFingerprint,
  ) => {
    const state = new SessionSecurityState(7, fingerprint, algorithm);
    if (build) state.setBuild(build);
    return service.createSession(state, mode);
  };

  const challenge = async (s: IdentityUpgradeSession, now?: number) => {
    const reply = (await s.handleRequest(now)) as { t: string; nonce: string };
    expect(reply.t).toBe('identity.challenge');
    return Buffer.from(reply.nonce, 'base64');
  };

  const proofFor = (
    nonce: Buffer,
    overrides: Partial<ProofFields> = {},
    key: KeyObject = ds.privateKey,
    v15 = false,
  ) => {
    const tuple = buildProofTuple({
      installationId: INSTALLATION,
      readerId: 7,
      oldFingerprint: Buffer.from(oldFingerprint, 'hex'),
      newSpki: dsSpki,
      nonce,
      ...overrides,
    });
    const signature = v15
      ? sign('sha256', tuple, key)
      : sign('sha256', tuple, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 });
    return signature.toString('base64');
  };

  const upgrade = (s: IdentityUpgradeSession, spki: Buffer, proof: string, now?: number) =>
    s.handleUpgrade({ t: 'identity.upgrade', spki: spki.toString('base64'), proof }, now);
  const credential = () => store.rows.get(7)?.credentialFingerprint;
  const unchanged = () => {
    expect(credential()).toBe(oldFingerprint);
    expect(store.events).toHaveLength(0);
  };

  it('replaces the software key with the DS key, keeps both in the history and audits it', async () => {
    const s = session();
    const nonce = await challenge(s);
    expect(nonce).toHaveLength(32);
    const reply = await upgrade(s, dsSpki, proofFor(nonce));
    expect(reply).toEqual({ t: 'identity.upgraded', certificate: expect.stringContaining('CERT') });
    const newFingerprint = spkiFingerprint(dsSpki);
    expect(credential()).toBe(newFingerprint);
    expect(store.events.map((e) => [e.state, e.keyFingerprint])).toEqual([
      ['replaced', oldFingerprint],
      ['paired', newFingerprint],
    ]);
    expect(await registry.isActive(7, newFingerprint)).toBe(true);
    expect(await registry.isActive(7, oldFingerprint)).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'attractap.reader.identity_upgraded',
        details: { oldFingerprint, newFingerprint, algorithm: 'rsa-3072' },
      }),
    );
    expect(validAttractapDetails('reader.identity_upgraded', audit.record.mock.calls[0][0].details)).toBe(true);
  });

  describe('rejects', () => {
    it('a forged proof (signed by another key) and a PKCS#1 v1.5 proof', async () => {
      const s = session();
      const nonce = await challenge(s);
      expect(await upgrade(s, dsSpki, proofFor(nonce, {}, other.privateKey))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      const again = await challenge(s);
      expect(await upgrade(s, dsSpki, proofFor(again, {}, ds.privateKey, true))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      unchanged();
    });

    it('a replayed nonce, and an attempt without a challenge', async () => {
      const s = session();
      const nonce = await challenge(s);
      const proof = proofFor(nonce);
      expect((await upgrade(s, dsSpki, proof)).t).toBe('identity.upgraded');
      expect(await upgrade(s, dsSpki, proof)).toEqual({ t: 'identity.upgrade.rejected', reason: 'bad-nonce' });
      expect(await upgrade(session(), dsSpki, proof)).toEqual({ t: 'identity.upgrade.rejected', reason: 'bad-nonce' });
    });

    it('spends the nonce on a failed attempt and keeps only one outstanding nonce', async () => {
      const s = session();
      const first = await challenge(s);
      const second = await challenge(s);
      expect(first.equals(second)).toBe(false);
      expect(await upgrade(s, dsSpki, proofFor(first))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      expect(await upgrade(s, dsSpki, proofFor(second))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-nonce',
      });
      unchanged();
    });

    it('an expired nonce', async () => {
      const s = session();
      const at = Date.now();
      const nonce = await challenge(s, at);
      expect(await upgrade(s, dsSpki, proofFor(nonce), at + NONCE_TTL_MS + 1)).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-nonce',
      });
      unchanged();
    });

    it('a nonce of another session', async () => {
      const a = session();
      const b = session();
      const nonceA = await challenge(a);
      await challenge(b);
      expect(await upgrade(b, dsSpki, proofFor(nonceA))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      unchanged();
    });

    it.each([
      ['another reader', { readerId: 8 }],
      ['another installation', { installationId: 'installation-2' }],
      ['another old fingerprint', { oldFingerprint: createHash('sha256').update('x').digest() }],
    ])('a proof over %s', async (_name, overrides) => {
      const s = session();
      const nonce = await challenge(s);
      expect(await upgrade(s, dsSpki, proofFor(nonce, overrides as Partial<ProofFields>))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      unchanged();
    });

    it('an SPKI that differs from the signing key', async () => {
      const s = session();
      const nonce = await challenge(s);
      const otherSpki = spkiOf(other.publicKey);
      expect(await upgrade(s, otherSpki, proofFor(nonce))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      unchanged();
    });

    it('an SPKI that is not RSA-3072, and a missing proof', async () => {
      const s = session();
      for (const bad of [
        spkiOf(generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey),
        spkiOf(generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey),
        Buffer.from('nonsense'),
      ]) {
        const nonce = await challenge(s);
        expect(await upgrade(s, bad, proofFor(nonce))).toEqual({ t: 'identity.upgrade.rejected', reason: 'bad-spki' });
      }
      const nonce = await challenge(s);
      expect(await s.handleUpgrade({ t: 'identity.upgrade', spki: dsSpki.toString('base64') })).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'bad-proof',
      });
      void nonce;
      unchanged();
    });

    it.each([
      ['a plain build', { profile: 'plain', release: true, variant: 'v', secureVersion: null }],
      [
        'a release secure build without a conversion',
        { profile: 'secure', release: true, variant: 'v', secureVersion: 1 },
      ],
      ['no firmware info', null],
    ] as Array<[string, ReportedBuild | null]>)('an upgrade by %s: the gate is closed', async (_name, build) => {
      const s = session(build);
      expect(await s.handleRequest()).toEqual({ t: 'identity.upgrade.rejected', reason: 'not-allowed' });
      // A valid-looking exchange does not get around the gate either.
      const nonce = Buffer.alloc(32, 1);
      expect(await upgrade(s, dsSpki, proofFor(nonce))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'not-allowed',
      });
      unchanged();
    });

    it('an upgrade from a session that already uses an RSA key', async () => {
      const s = session(lab, 'rsa-3072');
      expect(await s.handleRequest()).toEqual({ t: 'identity.upgrade.rejected', reason: 'not-allowed' });
    });

    it('an upgrade when the session credential is not active any more', async () => {
      const s = session();
      const nonce = await challenge(s);
      await registry.revoke(7, 1);
      store.events.length = 0;
      expect(await upgrade(s, dsSpki, proofFor(nonce))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'not-allowed',
      });
      expect(store.events).toHaveLength(0);
    });

    it('an upgrade that loses a race with a revoke (the revoke wins, nothing is re-paired)', async () => {
      const s = session();
      const nonce = await challenge(s);
      const isActive = registry.isActive.bind(registry);
      // The revoke lands after the active check and before the credential write.
      jest.spyOn(registry, 'isActive').mockImplementationOnce(async (id, fingerprint) => {
        const active = await isActive(id, fingerprint);
        await registry.revoke(7, 1);
        return active;
      });
      store.events.length = 0;
      expect(await upgrade(s, dsSpki, proofFor(nonce))).toEqual({
        t: 'identity.upgrade.rejected',
        reason: 'not-allowed',
      });
      expect(store.rows.get(7)?.pairingState).toBe('revoked');
      expect(store.events.map((e) => e.state)).toEqual(['revoked']);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('a key another reader already holds, and an internal failure, without changing anything', async () => {
      store.addReader({ id: 9, name: 'other', pairingState: 'paired', credentialFingerprint: spkiFingerprint(dsSpki) });
      const s = session();
      const nonce = await challenge(s);
      expect(await upgrade(s, dsSpki, proofFor(nonce))).toEqual({ t: 'identity.upgrade.rejected', reason: 'bad-spki' });
      store.rows.delete(9);
      identity.issueReaderCertificate.mockRejectedValueOnce(new Error('ca offline'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const again = await challenge(s);
      expect(await upgrade(s, dsSpki, proofFor(again))).toEqual({ t: 'identity.upgrade.rejected', reason: 'internal' });
      warn.mockRestore();
      unchanged();
      expect(new ConflictException('PairingKeyInUse')).toBeInstanceOf(Error);
    });

    it('more than a few challenge requests per session (the session ends)', async () => {
      const s = session();
      for (let i = 0; i < 5; i++) await s.handleRequest();
      expect(await s.handleRequest()).toBe('violation');
    });
  });

  describe('the gate', () => {
    it('opens for the lab profile and for a conversion in creating-key, nothing else', async () => {
      expect(await isIdentityUpgradeAllowed(1, lab)).toBe(true);
      expect(await isIdentityUpgradeAllowed(1, { ...lab, profile: 'secure', release: true })).toBe(false);
      expect(await isIdentityUpgradeAllowed(1, null)).toBe(false);
      expect(await isIdentityUpgradeAllowed(1, { ...lab, profile: 'secure' }, async () => 'creating-key')).toBe(true);
      expect(await isIdentityUpgradeAllowed(1, { ...lab, profile: 'plain' }, async () => 'staging')).toBe(false);
    });

    it('has a T3 hook that answers "not converting" until the conversion exists', async () => {
      expect(await readerConversionState(1)).toBeNull();
    });
  });

  describe('a reader that lost the certificate (15 minute window)', () => {
    const upgradeOnce = async () => {
      const s = session();
      expect((await upgrade(s, dsSpki, proofFor(await challenge(s)))).t).toBe('identity.upgraded');
    };

    it('gets a certificate for the active DS key again, without a new history row', async () => {
      await upgradeOnce();
      const events = store.events.length;
      expect(await service.isRecoverable(7, oldFingerprint)).toBe(true);
      const s = session(null, 'ecdsa-p256', 'recovery');
      const reply = await upgrade(s, dsSpki, proofFor(await challenge(s)));
      expect(reply).toEqual({ t: 'identity.upgraded', certificate: expect.stringContaining('CERT') });
      expect(store.events).toHaveLength(events);
      expect(credential()).toBe(spkiFingerprint(dsSpki));
    });

    it('refuses a different SPKI, and refuses once the window is over', async () => {
      await upgradeOnce();
      const s = session(null, 'ecdsa-p256', 'recovery');
      const otherSpki = spkiOf(other.publicKey);
      expect(
        await upgrade(s, otherSpki, proofFor(await challenge(s), { newSpki: otherSpki }, other.privateKey)),
      ).toEqual({ t: 'identity.upgrade.rejected', reason: 'bad-spki' });
      expect(await service.isRecoverable(7, oldFingerprint, Date.now() + RECOVERY_WINDOW_MS + 60_000)).toBe(false);
      expect(await service.isRecoverable(7, spkiFingerprint(Buffer.from('never paired')))).toBe(false);
      // The active key itself is not "recoverable": it signs in normally.
      expect(await service.isRecoverable(7, spkiFingerprint(dsSpki))).toBe(false);
    });
  });

  it('never puts a nonce, proof, SPKI or certificate into the audit log or the logs', async () => {
    const logs: string[] = [];
    const spies = (['log', 'debug', 'warn', 'error', 'verbose'] as const).map((m) =>
      jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => void logs.push(JSON.stringify(args))),
    );
    const s = session();
    const nonce = await challenge(s);
    const proof = proofFor(nonce);
    const reply = (await upgrade(s, dsSpki, proof)) as { certificate: string };
    spies.forEach((spy) => spy.mockRestore());
    const written = JSON.stringify(audit.record.mock.calls) + logs.join('');
    for (const secret of [
      nonce.toString('base64'),
      nonce.toString('hex'),
      proof,
      dsSpki.toString('base64'),
      reply.certificate,
    ]) {
      expect(written).not.toContain(secret);
    }
  });
});
