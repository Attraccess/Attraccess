import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Attractap } from '@attraccess/database-entities';
import { AuditService } from '../../audit/audit.service';
import { AttractapService } from '../attractap.service';
import { BootstrapGrants } from './bootstrap-grants';
import { CredentialRegistryService, CredentialSnapshot } from './credential-registry.service';
import { InstallationIdentityService } from './installation-identity.service';
import { PairingAuditAction, recordPairingEvent } from './pairing-audit';
import {
  Actor,
  ApproveInput,
  CREDENTIAL_CHANGED_EVENT,
  PairingMethod,
  PairingMode,
  PairingRequest,
} from './pairing-model';
import { spkiFingerprint } from './pki';

const MAX_NAME_LENGTH = 64;
/** Longest wait for the `accepted` frame to reach the operating system before the approval is undone. */
const ACCEPTED_SEND_TIMEOUT_MS = 5_000;

/** What `markPaired` changed, so it can be taken back if the reader never hears of it. */
interface Commit {
  readerId: number;
  fingerprint: string;
  before: CredentialSnapshot;
  hadPrevious: boolean;
  createdRecord: boolean;
}

/**
 * Carries out one approved pairing request: picks or creates the record, issues the certificate,
 * commits the credential, tells the reader and audits it. Every failure before the commit rolls a
 * new record back; a reader that is gone by the commit is never paired, and one that cannot be told
 * after the commit gets the record back exactly as it was.
 *
 * Runs while the request is claimed (`approving`), so it only notes in `endRequested` that the
 * request should end; the caller ends it afterwards.
 */
export class PairingApproval {
  private readonly logger = new Logger(PairingApproval.name);

  public constructor(
    private readonly attractap: AttractapService,
    private readonly identity: InstallationIdentityService,
    private readonly registry: CredentialRegistryService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly grants: BootstrapGrants,
  ) {}

  /** Returns the ID of the reader record the request is now paired with. */
  public async run(request: PairingRequest, input: ApproveInput, method: PairingMethod, actor: Actor): Promise<number> {
    const targetId = await this.resolveTarget(request, input);
    const commit = await this.commit(request, input, targetId, actor);

    // Committed. Sessions of the old credential end now, whatever happens next.
    this.events.emit(CREDENTIAL_CHANGED_EVENT, commit.readerId);
    if (!(await this.deliverAccepted(request))) {
      await this.undoUndelivered(request, commit, actor);
      throw new ConflictException('PairingReaderGone');
    }
    // Remaining window: `accepted` reached the operating system, but the connection may still drop
    // before the reader reads it. The reader then stays unpaired and asks again with the same key;
    // that key is this record's credential now, so the admin approves it as a takeover of this
    // record (or removes the pairing first). Nothing is paired that the admin did not approve.
    await this.recordApproval(commit.readerId, input.mode, method, actor, commit.hadPrevious);
    return commit.readerId;
  }

  private async resolveTarget(request: PairingRequest, input: ApproveInput): Promise<number | null> {
    if (input.mode === 'new') {
      if (request.boundReaderId) throw new BadRequestException('This reader already has a record; use pair');
      return null;
    }
    if (input.mode === 'pair') {
      if (!request.boundReaderId) throw new BadRequestException('Only readers signed in with a token can be paired');
      return request.boundReaderId;
    }
    if (!input.targetReaderId) throw new BadRequestException('targetReaderId is required');
    if (request.boundReaderId && request.boundReaderId !== input.targetReaderId) {
      throw new BadRequestException('This reader is bound to a different record');
    }
    if (!(await this.attractap.findReaderById(input.targetReaderId))) throw new NotFoundException('Reader not found');
    return input.targetReaderId;
  }

  /** Everything up to and including the one transaction that pairs the record. */
  private async commit(
    request: PairingRequest,
    input: ApproveInput,
    targetId: number | null,
    actor: Actor,
  ): Promise<Commit> {
    this.assertReaderStillThere(request);
    const fingerprint = spkiFingerprint(request.readerPublicKey);
    // One key, one reader: a key that is already some reader's active credential is not paired
    // to a second record. (Pairing the same record again with it is harmless.)
    const holder = await this.registry.findPairedReaderByFingerprint(fingerprint);
    if (holder !== null && holder !== targetId) throw new ConflictException('PairingKeyInUse');

    let created: Attractap | null = null;
    try {
      let reader: Attractap | null;
      if (targetId) {
        reader = await this.attractap.findReaderById(targetId);
      } else {
        created = (await this.attractap.createNewReader()).reader;
        reader = created;
        const name = input.name?.trim();
        if (name) reader = await this.attractap.updateReader(created.id, { name: name.slice(0, MAX_NAME_LENGTH) });
      }
      if (!reader) throw new Error('target reader disappeared');

      const certificate = await this.identity.issueReaderCertificate(reader.id, request.readerPublicKey);
      // The last await before the commit is behind us: a reader that left meanwhile is not paired.
      this.assertReaderStillThere(request);
      const { previousFingerprint, before } = await this.registry.markPaired({
        readerId: reader.id,
        fingerprint,
        certificate,
        actorId: actor.userId,
        previousCredentialBecomes: input.mode === 'takeover' ? 'replaced' : 'revoked',
      });
      this.grants.issue(fingerprint, reader.id, certificate.pem);
      return {
        readerId: reader.id,
        fingerprint,
        before,
        hadPrevious: previousFingerprint !== null,
        createdRecord: created !== null,
      };
    } catch (error) {
      await this.rollBack(request, created, error as Error);
      throw error instanceof ConflictException || error instanceof NotFoundException
        ? error
        : new ConflictException('PairingFailed');
    }
  }

  private assertReaderStillThere(request: PairingRequest): void {
    if (request.endRequested || request.ws.readyState !== request.ws.OPEN) {
      request.endRequested ??= { reason: 'reader-disconnected', actor: null };
      throw new ConflictException('PairingReaderGone');
    }
  }

  /**
   * Resolves once `accepted` was handed to the operating system; false when the connection is gone
   * or the write failed. (`ws` does not throw on a closed socket; only the callback tells.)
   */
  private deliverAccepted(request: PairingRequest): Promise<boolean> {
    const { ws } = request;
    if (request.endRequested || ws.readyState !== ws.OPEN) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ACCEPTED_SEND_TIMEOUT_MS);
      timer.unref?.();
      const settle = (delivered: boolean) => {
        clearTimeout(timer);
        resolve(delivered && ws.readyState === ws.OPEN);
      };
      try {
        ws.send(JSON.stringify({ type: 'accepted' }), (error) => settle(!error));
      } catch {
        settle(false);
      }
    });
  }

  /**
   * The commit happened but the reader never got `accepted`. The record gets back what it had
   * (a replaced reader its credential, a token reader its token), but only while it still holds
   * the key this approval wrote: a pairing committed meanwhile is left alone. A record created for
   * this approval is deleted again. One audit event explains it; best effort.
   */
  private async undoUndelivered(request: PairingRequest, commit: Commit, actor: Actor): Promise<void> {
    const { readerId, fingerprint, before } = commit;
    this.logger.warn(`Reader ${readerId} left before it was told about its approval; undoing it`);
    this.grants.forget(fingerprint);
    const undone = await this.registry
      .undoPairing({ readerId, fingerprint, before, actorId: actor.userId })
      .catch((error: Error) => {
        this.logger.error(`Undoing the undelivered approval failed: ${error.message}`);
        return null;
      });
    // Sessions and caches pick up the restored credential (or whatever holds now).
    this.events.emit(CREDENTIAL_CHANGED_EVENT, readerId);
    // A record created for this approval goes again, unless a later change made it someone else's.
    if (commit.createdRecord && undone !== false) await this.attractap.deleteReader(readerId).catch(() => undefined);
    else await this.record(readerId, 'reader.pairing_failed', actor, { reason: 'not-delivered' });
    request.endRequested = { reason: 'reader-disconnected', actor: null, ...request.endRequested, audited: true };
  }

  /**
   * Before the commit: removes a record created for this approval. The request ends, unless the key
   * turned out to be in use (the admin may still approve it as a takeover of that record).
   */
  private async rollBack(request: PairingRequest, created: Attractap | null, error: Error): Promise<void> {
    const conflict = error instanceof ConflictException ? error.message : null;
    if (conflict !== 'PairingReaderGone' && conflict !== 'PairingKeyInUse') {
      this.logger.error(`Completing pairing failed: ${error.message}`);
    }
    if (created) {
      this.grants.forgetReader(created.id);
      await this.attractap.deleteReader(created.id).catch(() => undefined);
    }
    if (conflict !== 'PairingKeyInUse') request.endRequested ??= { reason: 'internal', actor: null };
  }

  private async recordApproval(
    readerId: number,
    mode: PairingMode,
    method: PairingMethod,
    actor: Actor,
    hadPrevious: boolean,
  ): Promise<void> {
    if (hadPrevious) await this.record(readerId, 'reader.replaced', actor, { mode });
    if (mode === 'new') await this.record(readerId, 'reader.enrolled', actor, { method });
    else await this.record(readerId, 'reader.pairing_confirmed', actor, { mode, method });
  }

  private record(
    readerId: number,
    action: PairingAuditAction,
    actor: Actor,
    details: Record<string, string | number>,
  ): Promise<void> {
    return recordPairingEvent(this.audit, readerId, action, actor, details);
  }
}
