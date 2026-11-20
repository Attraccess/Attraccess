import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PASSWORD_POLICY_FIELDS,
  PASSWORD_POLICY_SINGLETON_ID,
  type PasswordPolicyOverrideRecord,
  type PasswordPolicyRole,
  type PasswordPolicyValues,
} from '@attraccess/application-models';
import { PasswordHistory, PasswordPolicy, PasswordPolicyOverride } from '@attraccess/database-entities';
import { EntityManager, OptimisticLockVersionMismatchError, QueryFailedError, Repository } from 'typeorm';
import { ScopedUnitOfWork, type TransactionScope, UNIT_OF_WORK } from '../../unit-of-work';
import {
  PasswordPolicyConflictError,
  PasswordPolicyConstraintError,
  type PasswordPolicyOverrideValues,
  type PasswordPolicyStore,
} from '../../../users-and-auth/password-policy/password-policy-store.port';
import { appendPasswordHistory } from './password-history';

function toValues(row: PasswordPolicy): PasswordPolicyValues {
  const values: Record<string, unknown> = {};
  for (const field of PASSWORD_POLICY_FIELDS) values[field] = row[field];
  return values as unknown as PasswordPolicyValues;
}

function toOverrideRecord(row: PasswordPolicyOverride): PasswordPolicyOverrideRecord {
  const record: Record<string, unknown> = { role: row.role };
  for (const field of PASSWORD_POLICY_FIELDS) record[field] = row[field] ?? null;
  return record as unknown as PasswordPolicyOverrideRecord;
}

/** The driver's rejections the application answers specially; everything else passes through. */
function translateRejection(error: unknown): never {
  if (error instanceof OptimisticLockVersionMismatchError) throw new PasswordPolicyConflictError();
  // 23514 check_violation (rule combinations), 22P02 invalid_text_representation (a role outside the enum type)
  if (error instanceof QueryFailedError) {
    const code = (error.driverError as { code?: string } | undefined)?.code;
    if (code === '23514' || code === '22P02') throw new PasswordPolicyConstraintError(error.message);
  }
  throw error;
}

@Injectable()
export class TypeOrmPasswordPolicyStore implements PasswordPolicyStore {
  constructor(
    @InjectRepository(PasswordPolicy) private readonly policies: Repository<PasswordPolicy>,
    @InjectRepository(PasswordPolicyOverride) private readonly overrides: Repository<PasswordPolicyOverride>,
    @InjectRepository(PasswordHistory) private readonly history: Repository<PasswordHistory>,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: ScopedUnitOfWork<EntityManager>,
  ) {}

  private manager(scope?: TransactionScope): EntityManager {
    return scope ? this.unitOfWork.handleOf(scope) : this.policies.manager;
  }

  async findPolicy(scope?: TransactionScope): Promise<PasswordPolicyValues | null> {
    const row = await this.manager(scope)
      .getRepository(PasswordPolicy)
      .findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } });
    return row ? toValues(row) : null;
  }

  async seedPolicy(values: PasswordPolicyValues): Promise<void> {
    const existing = await this.policies.findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } });
    if (existing) return;
    await this.policies.save(this.policies.create({ id: PASSWORD_POLICY_SINGLETON_ID, ...values }));
  }

  async savePolicy(
    changes: Partial<PasswordPolicyValues>,
    scope: TransactionScope,
  ): Promise<PasswordPolicyValues | null> {
    const policies = this.manager(scope).getRepository(PasswordPolicy);
    const row = await policies.findOne({ where: { id: PASSWORD_POLICY_SINGLETON_ID } });
    if (!row) return null;
    try {
      Object.assign(row, changes);
      return toValues(await policies.save(row));
    } catch (error) {
      return translateRejection(error);
    }
  }

  async listOverrides(scope?: TransactionScope): Promise<PasswordPolicyOverrideRecord[]> {
    const rows = await this.manager(scope)
      .getRepository(PasswordPolicyOverride)
      .find({ order: { role: 'ASC' } });
    return rows.map(toOverrideRecord);
  }

  async findOverride(role: PasswordPolicyRole, scope?: TransactionScope): Promise<PasswordPolicyOverrideRecord | null> {
    const row = await this.manager(scope).getRepository(PasswordPolicyOverride).findOne({ where: { role } });
    return row ? toOverrideRecord(row) : null;
  }

  async saveOverride(
    role: PasswordPolicyRole,
    values: PasswordPolicyOverrideValues,
    scope: TransactionScope,
  ): Promise<PasswordPolicyOverrideRecord> {
    const overrides = this.manager(scope).getRepository(PasswordPolicyOverride);
    try {
      const existing = await overrides.findOne({ where: { role } });
      if (existing) {
        Object.assign(existing, values);
        return toOverrideRecord(await overrides.save(existing));
      }
      const blank: Record<string, unknown> = { role };
      for (const field of PASSWORD_POLICY_FIELDS) blank[field] = null;
      return toOverrideRecord(
        await overrides.save(overrides.create({ ...blank, ...values } as Partial<PasswordPolicyOverride>)),
      );
    } catch (error) {
      return translateRejection(error);
    }
  }

  async deleteOverride(role: PasswordPolicyRole, scope: TransactionScope): Promise<boolean> {
    const overrides = this.manager(scope).getRepository(PasswordPolicyOverride);
    const existing = await overrides.findOne({ where: { role } });
    if (!existing) return false;
    try {
      await overrides.remove(existing);
    } catch (error) {
      return translateRejection(error);
    }
    return true;
  }

  async recentHistoryHashes(userId: number, limit: number): Promise<string[]> {
    const rows = await this.history.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return rows.map((row) => row.passwordHash);
  }

  async recordHistory(userId: number, passwordHash: string, keep: number, scope?: TransactionScope): Promise<void> {
    if (scope) return appendPasswordHistory(this.unitOfWork.handleOf(scope), userId, passwordHash, keep);
    await this.unitOfWork.run((own) =>
      appendPasswordHistory(this.unitOfWork.handleOf(own), userId, passwordHash, keep),
    );
  }
}
