import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AUDIT_RECORDER, type AuditRecorder } from '../../audit/recorder/audit-event';
import { CREDENTIAL_CHANGED, CredentialRegistryService } from './credential-registry.service';
import { isIdentityUpgradeAllowed } from './identity-upgrade-gate';
import { buildProofTuple, verifyProof } from './identity-upgrade-proof';
import { InstallationIdentityService } from './installation-identity.service';
import { spkiFingerprint } from './pki';
import { canonicalRsa3072Spki } from './reader-spki';
import type { SessionSecurityState } from './session-security-state';

export const NONCE_BYTES = 32;
export const NONCE_TTL_MS = 60_000;
/** A reader that lost the certificate may repeat the upgrade from its replaced key for this long. */
export const RECOVERY_WINDOW_MS = 15 * 60_000;
const MAX_REQUESTS_PER_SESSION = 5;

export type UpgradeRejection = 'not-allowed' | 'bad-nonce' | 'bad-spki' | 'bad-proof' | 'internal';
export type UpgradeReply = Record<string, unknown>;

export type UpgradeMode = 'session' | 'recovery';

/**
 * The upgrade exchange of one session. State lives in the object, so a nonce is bound to this session, this
 * reader and this old fingerprint, and is dropped with the session. Messages of a session are handled one
 * after the other (see ReaderControlService).
 */
export class IdentityUpgradeSession {
  private nonce: { value: Buffer; expiresAt: number } | null = null;
  private requests = 0;

  public constructor(
    private readonly service: IdentityUpgradeService,
    public readonly state: SessionSecurityState,
    public readonly mode: UpgradeMode,
  ) {}

  public async handleRequest(now = Date.now()): Promise<UpgradeReply | 'violation'> {
    if (++this.requests > MAX_REQUESTS_PER_SESSION) return 'violation';
    if (!(await this.service.allowed(this.state, this.mode)))
      return { t: 'identity.upgrade.rejected', reason: 'not-allowed' };
    // One outstanding nonce per session: a new request replaces the old one.
    this.nonce = { value: randomBytes(NONCE_BYTES), expiresAt: now + NONCE_TTL_MS };
    return { t: 'identity.challenge', nonce: this.nonce.value.toString('base64') };
  }

  public async handleUpgrade(message: Record<string, unknown>, now = Date.now()): Promise<UpgradeReply> {
    const reject = (reason: UpgradeRejection): UpgradeReply => ({ t: 'identity.upgrade.rejected', reason });
    // The nonce is spent by the first attempt, whatever its outcome.
    const nonce = this.nonce;
    this.nonce = null;
    try {
      if (!(await this.service.allowed(this.state, this.mode))) return reject('not-allowed');
      if (!nonce || now > nonce.expiresAt) return reject('bad-nonce');
      let spki: Buffer;
      let proof: Buffer;
      try {
        spki = canonicalRsa3072Spki(message['spki']);
        if (typeof message['proof'] !== 'string' || message['proof'].length > 2048) return reject('bad-proof');
        proof = Buffer.from(message['proof'], 'base64');
      } catch {
        return reject('bad-spki');
      }
      const tuple = buildProofTuple({
        installationId: await this.service.installationId(),
        readerId: this.state.readerId,
        oldFingerprint: Buffer.from(this.state.fingerprint, 'hex'),
        newSpki: spki,
        nonce: nonce.value,
      });
      if (!verifyProof(spki, tuple, proof)) return reject('bad-proof');
      return await this.service.apply(this.state, this.mode, spki);
    } catch (error) {
      if (error instanceof ConflictException) return reject('bad-spki');
      this.service.logFailure(error);
      return reject('internal');
    }
  }
}

@Injectable()
export class IdentityUpgradeService {
  private readonly logger = new Logger(IdentityUpgradeService.name);

  public constructor(
    private readonly identity: InstallationIdentityService,
    private readonly registry: CredentialRegistryService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  public createSession(state: SessionSecurityState, mode: UpgradeMode = 'session'): IdentityUpgradeSession {
    return new IdentityUpgradeSession(this, state, mode);
  }

  public installationId(): Promise<string> {
    return this.identity.getInstallationId();
  }

  public logFailure(error: unknown): void {
    // The message of an internal error never carries key material, but keep it to the message anyway.
    this.logger.warn(`Identity upgrade failed: ${(error as Error).message}`);
  }

  /**
   * A reader whose P-256 key was replaced within the recovery window may open an upgrade-only session:
   * it lost the certificate it was sent. Anything else stays an inactive credential.
   */
  public async isRecoverable(readerId: number, fingerprint: string, now = Date.now()): Promise<boolean> {
    const current = await this.registry.get(readerId);
    if (current?.state !== 'paired' || !current.fingerprint || current.fingerprint === fingerprint) return false;
    const history = await this.registry.history(readerId);
    const replaced = history.find((e) => e.state === 'replaced' && e.keyFingerprint === fingerprint);
    return !!replaced && now - replaced.createdAt.getTime() <= RECOVERY_WINDOW_MS;
  }

  public async allowed(state: SessionSecurityState, mode: UpgradeMode): Promise<boolean> {
    if (mode === 'recovery') return true; // the upgrade itself was allowed; this only re-sends a certificate
    if (state.algorithm !== 'ecdsa-p256') return false; // a DS identity never rotates
    return await isIdentityUpgradeAllowed(state.readerId, state.currentBuild());
  }

  /** Installs the new key (or, in recovery, re-sends the certificate of the active key). */
  public async apply(state: SessionSecurityState, mode: UpgradeMode, spki: Buffer): Promise<UpgradeReply> {
    const readerId = state.readerId;
    const newFingerprint = spkiFingerprint(spki);
    const certificate = await this.identity.issueReaderCertificate(readerId, spki);
    if (mode === 'recovery') {
      const current = await this.registry.get(readerId);
      // Only the key that is already the credential, and only from the key that was replaced by it.
      if (current?.state !== 'paired' || current.fingerprint !== newFingerprint) return rejected('bad-spki');
      if (!(await this.isRecoverable(readerId, state.fingerprint))) return rejected('not-allowed');
      await this.registry.recordCertificate(readerId, newFingerprint, certificate);
      return { t: 'identity.upgraded', certificate: certificate.pem };
    }
    if (!(await this.registry.isActive(readerId, state.fingerprint))) return rejected('not-allowed');
    try {
      await this.registry.markPaired({
        readerId,
        fingerprint: newFingerprint,
        certificate,
        actorId: null,
        previousCredentialBecomes: 'replaced',
        // A revoke or re-pair between the check above and this write must win.
        expectedFingerprint: state.fingerprint,
      });
    } catch (error) {
      if (error instanceof ConflictException && error.message === CREDENTIAL_CHANGED) return rejected('not-allowed');
      throw error;
    }
    await this.recordUpgrade(readerId, state.fingerprint, newFingerprint);
    return { t: 'identity.upgraded', certificate: certificate.pem };
  }

  private async recordUpgrade(readerId: number, oldFingerprint: string, newFingerprint: string): Promise<void> {
    try {
      await this.audit.record({
        domain: 'attractap',
        action: 'attractap.reader.identity_upgraded',
        actor: { id: null, authenticationMethod: null },
        subject: { type: 'attractap.reader', id: readerId },
        details: { oldFingerprint, newFingerprint, algorithm: 'rsa-3072' },
      });
    } catch (error) {
      this.logFailure(error);
    }
  }
}

function rejected(reason: UpgradeRejection): UpgradeReply {
  return { t: 'identity.upgrade.rejected', reason };
}
