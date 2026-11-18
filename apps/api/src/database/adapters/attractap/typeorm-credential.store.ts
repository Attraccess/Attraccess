import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Attractap, AttractapCredentialEvent } from '@attraccess/database-entities';
import type { AttractapCredentialEventRecord, AttractapPairingState } from '@attraccess/application-models';
import { EntityManager, Repository } from 'typeorm';
import type {
  AttractapCredentialStore,
  CredentialEventInput,
  CredentialPatch,
  ReaderCredentialRow,
} from '../../../attractap/security/credential-store.port';
import type { TransactionScope } from '../../unit-of-work';
import { TransactionHandles } from '../common/transaction-handles';
import { toCredentialEvent } from './attractap-mappers';

const CREDENTIAL_COLUMNS = {
  id: true,
  name: true,
  pairingState: true,
  credentialFingerprint: true,
  certificateSerial: true,
  pairedAt: true,
  certificateNotAfter: true,
  apiTokenHash: true,
} as const;

@Injectable()
export class TypeOrmAttractapCredentialStore implements AttractapCredentialStore {
  constructor(
    @InjectRepository(Attractap) private readonly readers: Repository<Attractap>,
    @InjectRepository(AttractapCredentialEvent) private readonly events: Repository<AttractapCredentialEvent>,
    private readonly handles: TransactionHandles,
  ) {}

  private manager(scope: TransactionScope): EntityManager {
    const manager = this.handles.managerOf(scope);
    if (!manager) throw new Error('A credential change needs an open unit of work');
    return manager;
  }

  async findState(readerId: number): Promise<{ state: AttractapPairingState; fingerprint: string | null } | null> {
    const reader = await this.readers.findOne({
      where: { id: readerId },
      select: { id: true, pairingState: true, credentialFingerprint: true },
    });
    return reader ? { state: reader.pairingState, fingerprint: reader.credentialFingerprint } : null;
  }

  async findPairedReaderIdByFingerprint(fingerprint: string, scope?: TransactionScope): Promise<number | null> {
    const readers = scope ? this.manager(scope).getRepository(Attractap) : this.readers;
    const reader = await readers.findOne({
      where: { credentialFingerprint: fingerprint, pairingState: 'paired' },
      select: { id: true },
    });
    return reader?.id ?? null;
  }

  async readCredential(scope: TransactionScope, readerId: number): Promise<ReaderCredentialRow | null> {
    const reader = await this.manager(scope).findOne(Attractap, {
      where: { id: readerId },
      select: CREDENTIAL_COLUMNS,
    });
    if (!reader) return null;
    return {
      id: reader.id,
      name: reader.name,
      pairingState: reader.pairingState,
      credentialFingerprint: reader.credentialFingerprint,
      pairedAt: reader.pairedAt ?? null,
      certificateNotAfter: reader.certificateNotAfter ?? null,
      certificateSerial: reader.certificateSerial ?? null,
      apiTokenHash: reader.apiTokenHash ?? '',
    };
  }

  async updateCredential(scope: TransactionScope, readerId: number, patch: CredentialPatch): Promise<void> {
    await this.manager(scope).update(Attractap, readerId, { ...patch });
  }

  async appendEvent(scope: TransactionScope, event: CredentialEventInput): Promise<void> {
    await this.manager(scope).insert(AttractapCredentialEvent, { ...event });
  }

  async updateCertificateIfActive(
    readerId: number,
    fingerprint: string,
    certificate: { serial: string; notAfter: Date },
  ): Promise<void> {
    await this.readers.update(
      { id: readerId, pairingState: 'paired', credentialFingerprint: fingerprint },
      { certificateNotAfter: certificate.notAfter, certificateSerial: certificate.serial },
    );
  }

  async history(readerId: number): Promise<AttractapCredentialEventRecord[]> {
    const events = await this.events.find({ where: { readerId }, order: { createdAt: 'DESC', id: 'DESC' } });
    return events.map(toCredentialEvent);
  }
}
