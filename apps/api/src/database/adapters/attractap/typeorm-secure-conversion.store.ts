import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttractapSecureConversion } from '@attraccess/database-entities';
import {
  ATTRACTAP_CONVERSION_TERMINAL_STATES,
  type AttractapConversionState,
  type AttractapSecureConversionPatch,
  type AttractapSecureConversionRecord,
  type NewAttractapSecureConversion,
} from '@attraccess/application-models';
import { In, Repository } from 'typeorm';
import type { AttractapSecureConversionStore } from '../../../attractap/secure-conversion/secure-conversion-store.port';
import { isUniqueViolation } from '../../persistence-errors';

function toRecord(row: AttractapSecureConversion): AttractapSecureConversionRecord {
  return {
    id: row.id,
    readerId: row.readerId,
    state: row.state,
    failedInState: row.failedInState,
    failureReason: row.failureReason,
    target: row.target,
    digest0: row.digest0,
    digest1: row.digest1,
    preflight: row.preflight,
    verified: row.verified,
    bytesDone: row.bytesDone,
    bytesTotal: row.bytesTotal,
    burnReport: row.burnReport,
    actorId: row.actorId,
    startedAt: row.startedAt,
    stateChangedAt: row.stateChangedAt,
    lastSeenAt: row.lastSeenAt,
    endedAt: row.endedAt,
  };
}

@Injectable()
export class TypeOrmAttractapSecureConversionStore implements AttractapSecureConversionStore {
  constructor(
    @InjectRepository(AttractapSecureConversion) private readonly rows: Repository<AttractapSecureConversion>,
  ) {}

  async findById(id: number): Promise<AttractapSecureConversionRecord | null> {
    const row = await this.rows.findOne({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async findActive(): Promise<AttractapSecureConversionRecord | null> {
    const row = await this.rows.findOne({ where: { active: true } });
    return row ? toRecord(row) : null;
  }

  async findLatestForReader(readerId: number): Promise<AttractapSecureConversionRecord | null> {
    const row = await this.rows.findOne({ where: { readerId }, order: { id: 'DESC' } });
    return row ? toRecord(row) : null;
  }

  async listActiveFor(readerIds: number[]): Promise<AttractapSecureConversionRecord[]> {
    if (!readerIds.length) return [];
    return (await this.rows.find({ where: { active: true, readerId: In(readerIds) } })).map(toRecord);
  }

  async insert(conversion: NewAttractapSecureConversion, at: Date): Promise<AttractapSecureConversionRecord | null> {
    try {
      const row = this.rows.create({ ...conversion, state: 'preflight', active: true, stateChangedAt: at });
      return toRecord(await this.rows.save(row));
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async update(
    id: number,
    patch: AttractapSecureConversionPatch,
    whenStates: readonly AttractapConversionState[],
  ): Promise<AttractapSecureConversionRecord | null> {
    const ending = patch.state !== undefined && ATTRACTAP_CONVERSION_TERMINAL_STATES.includes(patch.state);
    const values = { ...patch, ...(ending ? { active: false } : {}) };
    const result = await this.rows
      .createQueryBuilder()
      .update(AttractapSecureConversion)
      .set(values as Partial<AttractapSecureConversion>)
      .where('id = :id AND state IN (:...states)', { id, states: [...whenStates] })
      .execute();
    if (!result.affected) return null;
    return await this.findById(id);
  }
}
