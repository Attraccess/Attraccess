import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { remoteEvent } from '../websockets/reader-event-relay';
import { CREDENTIAL_CHANGED_EVENT } from './pairing-model';
import type {
  AttractapCredentialEventRecord,
  AttractapCredentialSnapshot,
  AttractapPairingState,
} from '@attraccess/application-models';
import { UNIT_OF_WORK, type UnitOfWork } from '../../database/unit-of-work';
import { ReaderDeletedEvent } from '../events';
import {
  ATTRACTAP_CREDENTIAL_STORE,
  type AttractapCredentialStore,
  type CredentialSecurityPatch,
} from './credential-store.port';

export interface ActiveCredential {
  state: AttractapPairingState;
  fingerprint: string | null;
}

export interface IssuedCertificate {
  serial: string;
  notAfter: Date;
}

/**
 * What a credential change does to the eFuse report result: it described the previous key, so the admin UI shows
 * "no report received yet" until the new session's report is checked.
 */
const NO_SECURITY_REPORT: CredentialSecurityPatch = {
  secured: false,
  securedAt: null,
  efuseSecureVersion: null,
  securityReportCheckedAt: null,
  securityReportProblems: null,
};

/** The credential columns of a reader row as `markPaired` found them, so an undo can put them back. */
export type CredentialSnapshot = AttractapCredentialSnapshot;

/**
 * Owns every change to a reader's credential. Each change writes the reader row and the
 * append-only history in one unit of work and then clears the cache, so a session handshake
 * never needs a database write and normally no read.
 */
@Injectable()
export class CredentialRegistryService {
  private readonly cache = new Map<number, ActiveCredential | null>();
  /** Bumped on every invalidation so a read that started earlier cannot re-cache stale state. */
  private readonly generations = new Map<number, number>();

  public constructor(
    @Inject(ATTRACTAP_CREDENTIAL_STORE) private readonly store: AttractapCredentialStore,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  public async get(readerId: number): Promise<ActiveCredential | null> {
    if (this.cache.has(readerId)) return this.cache.get(readerId) ?? null;
    const generation = this.generations.get(readerId) ?? 0;
    const value = await this.store.findState(readerId);
    if ((this.generations.get(readerId) ?? 0) === generation) this.cache.set(readerId, value);
    return value;
  }

  public invalidate(readerId: number): void {
    this.cache.delete(readerId);
    this.generations.set(readerId, (this.generations.get(readerId) ?? 0) + 1);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  @OnEvent(remoteEvent(ReaderDeletedEvent.EVENT_NAME))
  public onReaderDeleted(event: ReaderDeletedEvent): void {
    this.invalidate(event.readerId);
  }

  /** A credential revoked or replaced on another API instance must not stay cached here (ATT-1163). */
  @OnEvent(remoteEvent(CREDENTIAL_CHANGED_EVENT))
  public onRemoteCredentialChanged(readerId: number): void {
    this.invalidate(readerId);
  }

  /** True when the key fingerprint is the reader's current, active credential. */
  public async isActive(readerId: number, fingerprint: string): Promise<boolean> {
    const credential = await this.get(readerId);
    return credential?.state === 'paired' && credential.fingerprint === fingerprint;
  }

  /** The paired reader whose current credential is this key, if any. */
  public async findPairedReaderByFingerprint(fingerprint: string): Promise<number | null> {
    return await this.store.findPairedReaderIdByFingerprint(fingerprint);
  }

  /**
   * Makes `fingerprint` the reader's only credential. A different, still active credential is
   * closed in the history as revoked (re-pair) or replaced (replace). Decided on the row as it
   * is inside the transaction, so concurrent changes cannot leave the history inconsistent.
   * Returns the credential columns as they were, for `undoPairing`.
   */
  public async markPaired(input: {
    readerId: number;
    fingerprint: string;
    certificate: IssuedCertificate;
    actorId: number;
    previousCredentialBecomes: 'revoked' | 'replaced';
  }): Promise<{ previousFingerprint: string | null; before: CredentialSnapshot }> {
    const { readerId, fingerprint, certificate, actorId } = input;
    try {
      return await this.unitOfWork.run(async (scope) => {
        const reader = await this.store.readCredential(scope, readerId);
        if (!reader) throw new NotFoundException('Reader not found');
        // One key, one reader: two records must never share an active credential.
        const holderId = await this.store.findPairedReaderIdByFingerprint(fingerprint, scope);
        if (holderId !== null && holderId !== reader.id) throw new ConflictException('PairingKeyInUse');
        const previous =
          reader.pairingState === 'paired' &&
          reader.credentialFingerprint &&
          reader.credentialFingerprint !== fingerprint
            ? reader.credentialFingerprint
            : null;
        if (previous) {
          await this.store.appendEvent(scope, {
            readerId: reader.id,
            readerName: reader.name,
            keyFingerprint: previous,
            certificateSerial: reader.certificateSerial,
            state: input.previousCredentialBecomes,
            actorId,
          });
        }
        await this.store.updateCredential(scope, reader.id, {
          pairingState: 'paired',
          credentialFingerprint: fingerprint,
          pairedAt: new Date(),
          certificateNotAfter: certificate.notAfter,
          certificateSerial: certificate.serial,
          // A new credential has to pass the eFuse report check again.
          ...NO_SECURITY_REPORT,
        });
        await this.store.appendEvent(scope, {
          readerId: reader.id,
          readerName: reader.name,
          keyFingerprint: fingerprint,
          certificateSerial: certificate.serial,
          state: 'paired',
          actorId,
        });
        return { previousFingerprint: previous, before: snapshotOf(reader) };
      });
    } finally {
      this.invalidate(readerId);
    }
  }

  /**
   * Takes back a pairing the reader never learned about: the row gets the credential columns
   * `markPaired` found (`before`) again.
   * Applied only while `fingerprint` is still the reader's active credential; a change that
   * happened since wins. The history is appended to, never rewritten: the undone key is closed as
   * revoked and a credential that becomes active again is recorded as paired. Returns whether it
   * undid anything.
   */
  public async undoPairing(input: {
    readerId: number;
    fingerprint: string;
    before: CredentialSnapshot;
    actorId: number;
  }): Promise<boolean> {
    const { readerId, fingerprint, before, actorId } = input;
    try {
      return await this.unitOfWork.run(async (scope) => {
        const reader = await this.store.readCredential(scope, readerId);
        if (!reader || reader.pairingState !== 'paired' || reader.credentialFingerprint !== fingerprint) return false;
        const restored = before.pairingState === 'paired' ? before.credentialFingerprint : null;
        const event = { readerId: reader.id, readerName: reader.name, actorId };
        if (restored !== fingerprint) {
          await this.store.appendEvent(scope, {
            ...event,
            keyFingerprint: fingerprint,
            certificateSerial: reader.certificateSerial,
            state: 'revoked',
          });
        }
        if (restored) {
          await this.store.appendEvent(scope, {
            ...event,
            keyFingerprint: restored,
            certificateSerial: before.certificateSerial,
            state: 'paired',
          });
        }
        await this.store.updateCredential(scope, reader.id, { ...before });
        return true;
      });
    } finally {
      this.invalidate(readerId);
    }
  }

  /** Revokes the reader's current credential. Throws when the reader is not paired (any more). */
  public async revoke(readerId: number, actorId: number): Promise<void> {
    try {
      await this.unitOfWork.run(async (scope) => {
        const reader = await this.store.readCredential(scope, readerId);
        if (!reader) throw new NotFoundException('Reader not found');
        if (reader.pairingState !== 'paired' || !reader.credentialFingerprint) {
          throw new ConflictException('Reader is not paired');
        }
        await this.store.appendEvent(scope, {
          readerId: reader.id,
          readerName: reader.name,
          keyFingerprint: reader.credentialFingerprint,
          certificateSerial: reader.certificateSerial,
          state: 'revoked',
          actorId,
        });
        await this.store.updateCredential(scope, reader.id, {
          pairingState: 'revoked',
          certificateNotAfter: null,
          ...NO_SECURITY_REPORT,
        });
      });
    } finally {
      this.invalidate(readerId);
    }
  }

  /**
   * A new certificate for the same key: the credential (and its history) stays the same.
   * Applied only while that key is still the reader's active credential.
   */
  public async recordCertificate(readerId: number, fingerprint: string, certificate: IssuedCertificate): Promise<void> {
    await this.store.updateCertificateIfActive(readerId, fingerprint, certificate);
  }

  public async history(readerId: number): Promise<AttractapCredentialEventRecord[]> {
    return await this.store.history(readerId);
  }
}

function snapshotOf(reader: AttractapCredentialSnapshot): CredentialSnapshot {
  return {
    pairingState: reader.pairingState,
    credentialFingerprint: reader.credentialFingerprint,
    pairedAt: reader.pairedAt ?? null,
    certificateNotAfter: reader.certificateNotAfter ?? null,
    certificateSerial: reader.certificateSerial ?? null,
  };
}
