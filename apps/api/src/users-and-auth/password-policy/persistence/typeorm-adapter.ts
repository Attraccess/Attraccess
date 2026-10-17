import {
  AuthenticationDetail,
  AuthenticationType,
  PasswordPolicy,
  PASSWORD_POLICY_SINGLETON_ID,
  PasswordPolicyOverride,
  PasswordPolicyRole,
  PasswordHistory,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, OptimisticLockVersionMismatchError, QueryFailedError, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { NewPasswordPolicy, PasswordPolicyPersistence, PasswordPolicyStorageError, PolicyOverrideDraft } from './port';

@Injectable()
export class TypeormPasswordPolicyPersistence extends PasswordPolicyPersistence {
  constructor(
    @InjectRepository(PasswordPolicy) private readonly policies: Repository<PasswordPolicy>,
    @InjectRepository(PasswordPolicyOverride) private readonly overrideRows: Repository<PasswordPolicyOverride>,
    @InjectRepository(PasswordHistory) private readonly history: Repository<PasswordHistory>,
    @InjectRepository(AuthenticationDetail) private readonly authentication: Repository<AuthenticationDetail>,
  ) {
    super();
  }
  async policy(): Promise<PasswordPolicy | null> {
    return toApplicationRecord(await this.policies.findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } }));
  }
  async override(role: PasswordPolicyRole): Promise<PasswordPolicyOverride | null> {
    return toApplicationRecord(await this.overrideRows.findOne({ where: { role } }));
  }
  async overrides(ordered = false): Promise<PasswordPolicyOverride[]> {
    return toApplicationRecord(await this.overrideRows.find(ordered ? { order: { role: 'ASC' } } : undefined));
  }
  async savePolicy(policy: PasswordPolicy | NewPasswordPolicy): Promise<PasswordPolicy> {
    return this.persist(async () =>
      toApplicationRecord(await this.policies.save('version' in policy ? policy : this.policies.create(policy))),
    );
  }
  async saveOverride(
    override: PasswordPolicyOverride | PolicyOverrideDraft,
    create = false,
  ): Promise<PasswordPolicyOverride> {
    return this.persist(async () =>
      toApplicationRecord(await this.overrideRows.save(create ? this.overrideRows.create(override) : override)),
    );
  }
  async removeOverride(override: PasswordPolicyOverride): Promise<void> {
    await this.persist(() => this.overrideRows.remove(override));
  }
  async recordHistory(userId: number, passwordHash: string): Promise<void> {
    await this.history.save(this.history.create({ userId, passwordHash }));
  }
  async currentPassword(userId: number): Promise<string | null> {
    return (
      (await this.authentication.findOne({ where: { userId, type: AuthenticationType.LOCAL_PASSWORD } }))?.password ??
      null
    );
  }
  async recentHistory(userId: number, limit: number): Promise<PasswordHistory[]> {
    return toApplicationRecord(
      await this.history.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit }),
    );
  }
  async historyIdsToKeep(userId: number, limit: number): Promise<number[]> {
    return (
      await this.history.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit, select: ['id'] })
    ).map(({ id }) => id);
  }
  async deleteOtherHistory(userId: number, keepIds: readonly number[]): Promise<void> {
    const builder = this.history.createQueryBuilder().delete().where('userId = :userId', { userId });
    if (keepIds.length) builder.andWhere('id NOT IN (:...keepIds)', { keepIds: [...keepIds] });
    await builder.execute();
  }
  private async persist<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError)
        throw new PasswordPolicyStorageError('concurrent-change', error.message);
      if (error instanceof QueryFailedError && /CHECK constraint failed/i.test(error.message))
        throw new PasswordPolicyStorageError('invalid-policy', error.message);
      throw error;
    }
  }
}
export function passwordPolicyTransactionOperations(manager: EntityManager): TypeormPasswordPolicyPersistence {
  return new TypeormPasswordPolicyPersistence(
    manager.getRepository(PasswordPolicy),
    manager.getRepository(PasswordPolicyOverride),
    manager.getRepository(PasswordHistory),
    manager.getRepository(AuthenticationDetail),
  );
}
