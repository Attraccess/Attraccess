import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Attractap, AttractapCredentialEvent } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { ReaderDeletedEvent } from '../events';

export interface ActiveCredential {
  state: 'unpaired' | 'paired' | 'revoked';
  fingerprint: string | null;
}

export interface IssuedCertificate {
  serial: string;
  notAfter: Date;
}

/** The credential columns of a reader row as `markPaired` found them, so an undo can put them back. */
export interface CredentialSnapshot {
  pairingState: Attractap['pairingState'];
  credentialFingerprint: string | null;
  pairedAt: Date | null;
  certificateNotAfter: Date | null;
  certificateSerial: string | null;
  apiTokenHash: string;
}

const SNAPSHOT = {
  id: true,
  name: true,
  pairingState: true,
  credentialFingerprint: true,
  certificateSerial: true,
} as const;

const FULL_SNAPSHOT = { ...SNAPSHOT, pairedAt: true, certificateNotAfter: true, apiTokenHash: true } as const;

/**
 * Owns every change to a reader's credential. Each change writes the reader row and the
 * append-only history in one transaction and then clears the cache, so a session handshake
 * never needs a SQLite write and normally no read.
 */
@Injectable()
export class CredentialRegistryService {
  private readonly cache = new Map<number, ActiveCredential | null>();
  /** Bumped on every invalidation so a read that started earlier cannot re-cache stale state. */
  private readonly generations = new Map<number, number>();

  public constructor(
    @InjectRepository(Attractap) private readonly readers: Repository<Attractap>,
    @InjectRepository(AttractapCredentialEvent) private readonly events: Repository<AttractapCredentialEvent>,
  ) {}

  public async get(readerId: number): Promise<ActiveCredential | null> {
    if (this.cache.has(readerId)) return this.cache.get(readerId) ?? null;
    const generation = this.generations.get(readerId) ?? 0;
    const reader = await this.readers.findOne({
      where: { id: readerId },
      select: { id: true, pairingState: true, credentialFingerprint: true },
    });
    const value = reader ? { state: reader.pairingState, fingerprint: reader.credentialFingerprint } : null;
    if ((this.generations.get(readerId) ?? 0) === generation) this.cache.set(readerId, value);
    return value;
  }

  public invalidate(readerId: number): void {
    this.cache.delete(readerId);
    this.generations.set(readerId, (this.generations.get(readerId) ?? 0) + 1);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  public onReaderDeleted(event: ReaderDeletedEvent): void {
    this.invalidate(event.readerId);
  }

  /** True when the key fingerprint is the reader's current, active credential. */
  public async isActive(readerId: number, fingerprint: string): Promise<boolean> {
    const credential = await this.get(readerId);
    return credential?.state === 'paired' && credential.fingerprint === fingerprint;
  }

  /** The paired reader whose current credential is this key, if any. */
  public async findPairedReaderByFingerprint(fingerprint: string): Promise<number | null> {
    const reader = await this.readers.findOne({
      where: { credentialFingerprint: fingerprint, pairingState: 'paired' },
      select: { id: true },
    });
    return reader?.id ?? null;
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
      return await runSerializedTransaction(this.readers.manager, async (manager) => {
        const reader = await manager.findOne(Attractap, { where: { id: readerId }, select: FULL_SNAPSHOT });
        if (!reader) throw new NotFoundException('Reader not found');
        // One key, one reader: two records must never share an active credential.
        const holder = await manager.findOne(Attractap, {
          where: { credentialFingerprint: fingerprint, pairingState: 'paired' },
          select: { id: true },
        });
        if (holder && holder.id !== reader.id) throw new ConflictException('PairingKeyInUse');
        const previous =
          reader.pairingState === 'paired' &&
          reader.credentialFingerprint &&
          reader.credentialFingerprint !== fingerprint
            ? reader.credentialFingerprint
            : null;
        if (previous) {
          await manager.insert(AttractapCredentialEvent, {
            readerId: reader.id,
            readerName: reader.name,
            keyFingerprint: previous,
            certificateSerial: reader.certificateSerial,
            state: input.previousCredentialBecomes,
            actorId,
          });
        }
        await manager.update(Attractap, reader.id, {
          pairingState: 'paired',
          credentialFingerprint: fingerprint,
          pairedAt: new Date(),
          certificateNotAfter: certificate.notAfter,
          certificateSerial: certificate.serial,
          apiTokenHash: '', // token sign-in is over for this reader
        });
        await manager.insert(AttractapCredentialEvent, {
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
   * `markPaired` found (`before`) again, with the token hash, so a working reader keeps working.
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
      return await runSerializedTransaction(this.readers.manager, async (manager) => {
        const reader = await manager.findOne(Attractap, { where: { id: readerId }, select: SNAPSHOT });
        if (!reader || reader.pairingState !== 'paired' || reader.credentialFingerprint !== fingerprint) return false;
        const restored = before.pairingState === 'paired' ? before.credentialFingerprint : null;
        const event = { readerId: reader.id, readerName: reader.name, actorId };
        if (restored !== fingerprint) {
          await manager.insert(AttractapCredentialEvent, {
            ...event,
            keyFingerprint: fingerprint,
            certificateSerial: reader.certificateSerial,
            state: 'revoked',
          });
        }
        if (restored) {
          await manager.insert(AttractapCredentialEvent, {
            ...event,
            keyFingerprint: restored,
            certificateSerial: before.certificateSerial,
            state: 'paired',
          });
        }
        await manager.update(Attractap, reader.id, { ...before });
        return true;
      });
    } finally {
      this.invalidate(readerId);
    }
  }

  /** Revokes the reader's current credential. Throws when the reader is not paired (any more). */
  public async revoke(readerId: number, actorId: number): Promise<void> {
    try {
      await runSerializedTransaction(this.readers.manager, async (manager) => {
        const reader = await manager.findOne(Attractap, { where: { id: readerId }, select: SNAPSHOT });
        if (!reader) throw new NotFoundException('Reader not found');
        if (reader.pairingState !== 'paired' || !reader.credentialFingerprint) {
          throw new ConflictException('Reader is not paired');
        }
        await manager.insert(AttractapCredentialEvent, {
          readerId: reader.id,
          readerName: reader.name,
          keyFingerprint: reader.credentialFingerprint,
          certificateSerial: reader.certificateSerial,
          state: 'revoked',
          actorId,
        });
        await manager.update(Attractap, reader.id, { pairingState: 'revoked', certificateNotAfter: null });
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
    await this.readers.update(
      { id: readerId, pairingState: 'paired', credentialFingerprint: fingerprint },
      { certificateNotAfter: certificate.notAfter, certificateSerial: certificate.serial },
    );
  }

  public async history(readerId: number): Promise<AttractapCredentialEvent[]> {
    return await this.events.find({ where: { readerId }, order: { createdAt: 'DESC', id: 'DESC' } });
  }
}

function snapshotOf(reader: Attractap): CredentialSnapshot {
  return {
    pairingState: reader.pairingState,
    credentialFingerprint: reader.credentialFingerprint,
    pairedAt: reader.pairedAt ?? null,
    certificateNotAfter: reader.certificateNotAfter ?? null,
    certificateSerial: reader.certificateSerial ?? null,
    apiTokenHash: reader.apiTokenHash ?? '',
  };
}
