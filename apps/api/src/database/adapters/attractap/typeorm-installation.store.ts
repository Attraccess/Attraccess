import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttractapInstallation } from '@attraccess/database-entities';
import type { AttractapInstallationRecord } from '@attraccess/application-models';
import { Repository } from 'typeorm';
import type { AttractapInstallationStore } from '../../../attractap/security/installation-store.port';
import { toInstallation } from './attractap-mappers';

const SINGLETON_ID = 1;

@Injectable()
export class TypeOrmAttractapInstallationStore implements AttractapInstallationStore {
  constructor(
    @InjectRepository(AttractapInstallation) private readonly installations: Repository<AttractapInstallation>,
  ) {}

  async find(): Promise<AttractapInstallationRecord | null> {
    const row = await this.installations.findOneBy({ id: SINGLETON_ID });
    return row ? toInstallation(row) : null;
  }

  async save(record: AttractapInstallationRecord): Promise<AttractapInstallationRecord> {
    const saved = await this.installations.save(this.installations.create({ id: SINGLETON_ID, ...record }));
    return toInstallation(saved);
  }
}
