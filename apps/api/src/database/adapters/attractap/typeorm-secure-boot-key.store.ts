import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Attractap, AttractapSecureBootKey } from '@attraccess/database-entities';
import type {
  AttractapSecureBootKeyRecord,
  NewAttractapSecureBootKey,
  AttractapSecureBootKeyRole,
} from '@attraccess/application-models';
import { IsNull, Not, Raw, Repository } from 'typeorm';
import type { AttractapSecureBootKeyStore } from '../../../attractap/secure-boot/secure-boot-key-store.port';
import type { TransactionScope } from '../../unit-of-work';
import { TransactionHandles } from '../common/transaction-handles';
import { toSecureBootKey } from './attractap-mappers';

@Injectable()
export class TypeOrmAttractapSecureBootKeyStore implements AttractapSecureBootKeyStore {
  constructor(
    @InjectRepository(AttractapSecureBootKey) private readonly keys: Repository<AttractapSecureBootKey>,
    @InjectRepository(Attractap) private readonly readers: Repository<Attractap>,
    private readonly handles: TransactionHandles,
  ) {}

  private repository(scope: TransactionScope): Repository<AttractapSecureBootKey> {
    const manager = this.handles.managerOf(scope);
    if (!manager) throw new Error('A key change needs an open unit of work');
    return manager.getRepository(AttractapSecureBootKey);
  }

  async latest(role: AttractapSecureBootKeyRole): Promise<AttractapSecureBootKeyRecord | null> {
    const key = await this.keys.findOne({ where: { role }, order: { id: 'DESC' } });
    return key ? toSecureBootKey(key) : null;
  }

  async count(): Promise<number> {
    return await this.keys.count();
  }

  async findByDigest(digest: string): Promise<AttractapSecureBootKeyRecord | null> {
    const key = await this.keys.findOne({ where: { digest } });
    return key ? toSecureBootKey(key) : null;
  }

  async listWithPrivateKey(): Promise<AttractapSecureBootKeyRecord[]> {
    const keys = await this.keys.find({ where: { privateKeyEncrypted: Not(IsNull()) }, order: { id: 'DESC' } });
    return keys.map(toSecureBootKey);
  }

  async countReadersWithBurnedDigest(digest?: string): Promise<number> {
    const value = digest
      ? Raw((column) => `LOWER(${column}) = :digest`, { digest: digest.toLowerCase() })
      : Not(IsNull());
    return await this.readers.count({ where: [{ secureBootDigest0: value }, { secureBootDigest1: value }] });
  }

  async remove(scope: TransactionScope, role?: AttractapSecureBootKeyRole): Promise<void> {
    const repository = this.repository(scope);
    await (role ? repository.delete({ role }) : repository.clear());
  }

  async insert(scope: TransactionScope, key: NewAttractapSecureBootKey): Promise<AttractapSecureBootKeyRecord> {
    const repository = this.repository(scope);
    return toSecureBootKey(await repository.save(repository.create({ ...key })));
  }

  async markRecoveryVerified(id: number, verifiedAt: Date): Promise<void> {
    await this.keys.update(id, { privateKeyEncrypted: null, verifiedAt });
  }
}
