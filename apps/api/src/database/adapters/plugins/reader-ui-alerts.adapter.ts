import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ReaderUiAlert } from '@attraccess/database-entities';
import type { ReaderUiAlertKind, ReaderUiAlertRecord } from '@attraccess/application-models';
import { IsNull, Repository } from 'typeorm';
import type { ReaderUiAlertScope, ReaderUiAlertStore } from '../../../plugin-system/reader-ui/reader-ui-alerts.port';

const toRecord = (row: ReaderUiAlert): ReaderUiAlertRecord => ({
  id: row.id,
  kind: row.kind,
  plugin: row.plugin ?? null,
  readerId: row.readerId ?? null,
  message: row.message,
  createdAt: row.createdAt,
  clearedAt: row.clearedAt ?? null,
  clearedByUserId: row.clearedByUserId ?? null,
});

const scopeWhere = (kind: ReaderUiAlertKind, scope: ReaderUiAlertScope) => ({
  kind,
  plugin: scope.plugin ?? IsNull(),
  readerId: scope.readerId ?? IsNull(),
  clearedAt: IsNull(),
});

/** TypeORM implementation of the reader UI alert store. */
@Injectable()
export class ReaderUiAlertsAdapter implements ReaderUiAlertStore {
  constructor(@InjectRepository(ReaderUiAlert) private readonly repository: Repository<ReaderUiAlert>) {}

  async listOpen(): Promise<ReaderUiAlertRecord[]> {
    return (await this.repository.find({ where: { clearedAt: IsNull() }, order: { createdAt: 'DESC' } })).map(toRecord);
  }

  async findOpen(id: number): Promise<ReaderUiAlertRecord | null> {
    const row = await this.repository.findOne({ where: { id, clearedAt: IsNull() } });
    return row ? toRecord(row) : null;
  }

  async listOpenInScope(kind: ReaderUiAlertKind, scope: ReaderUiAlertScope): Promise<ReaderUiAlertRecord[]> {
    return (await this.repository.find({ where: scopeWhere(kind, scope) })).map(toRecord);
  }

  async open(alert: {
    kind: ReaderUiAlertKind;
    message: string;
    plugin: string | null;
    readerId: number | null;
  }): Promise<ReaderUiAlertRecord> {
    return toRecord(await this.repository.save(this.repository.create(alert)));
  }

  async clear(id: number, clearedByUserId: number | null): Promise<ReaderUiAlertRecord> {
    const row = await this.repository.findOneByOrFail({ id });
    row.clearedAt = new Date();
    row.clearedByUserId = clearedByUserId;
    return toRecord(await this.repository.save(row));
  }
}
