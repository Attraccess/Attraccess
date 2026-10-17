import {
  Attractap,
  AttractapCrashReport,
  AttractapFirmwareVersion,
  NFCCard,
  Resource,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import { AttractapPersistence, AttractapResourceReader, NewCard, NewCrashReport } from './port';

@Injectable()
export class TypeormAttractapPersistence extends AttractapPersistence {
  constructor(
    @InjectRepository(NFCCard) private readonly cards: Repository<NFCCard>,
    @InjectRepository(Attractap) private readonly readers: Repository<Attractap>,
    @InjectRepository(AttractapCrashReport) private readonly crashes: Repository<AttractapCrashReport>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async recordCrash(report: NewCrashReport): Promise<AttractapCrashReport> {
    return toApplicationRecord(await this.crashes.save(report));
  }
  async readerFirmware(readerId: number): Promise<Attractap | null> {
    return toApplicationRecord(await this.readers.findOne({ where: { id: readerId } }));
  }
  async recordSymbolication(
    reportId: number,
    status: string,
    backtrace: string | null,
    buildId?: string | null,
  ): Promise<void> {
    await this.crashes.update(reportId, {
      ...(buildId !== undefined ? { coredumpBuildId: buildId } : {}),
      symbolicationStatus: status,
      symbolizedBacktrace: backtrace,
    });
  }
  async readerCrashReports(readerId: number): Promise<AttractapCrashReport[]> {
    return toApplicationRecord(
      await this.crashes.find({ where: { attractapId: readerId }, order: { createdAt: 'DESC' } }),
    );
  }
  async crashCoredump(readerId: number, reportId: number): Promise<AttractapCrashReport | null> {
    return toApplicationRecord(
      await this.crashes.findOne({
        where: { id: reportId, attractapId: readerId },
        select: { id: true, attractapId: true, coredump: true },
      }),
    );
  }
  async touchReader(id: number, at: Date): Promise<void> {
    await this.readers.update(id, { lastConnection: at });
  }
  async readerWithResources(id: number): Promise<Attractap | null> {
    return toApplicationRecord(
      await this.readers.findOne({
        where: { id },
        relations: [
          'resources',
          'resources.billingConfigurations',
          'resources.introducers',
          'resources.introducers.user',
        ],
      }),
    );
  }
  async registerReader(apiTokenHash: string, name: string, firmware?: AttractapFirmwareVersion): Promise<Attractap> {
    return toApplicationRecord(await this.readers.save({ apiTokenHash, name, firmware }));
  }
  async resourcesByIds(ids: readonly number[]): Promise<Resource[]> {
    if (!ids.length) return [];
    return toApplicationRecord(await this.resources.find({ where: { id: In([...ids]) } }));
  }
  async saveReader(reader: Attractap): Promise<Attractap> {
    return toApplicationRecord(await this.readers.save(reader));
  }
  async removeReader(id: number): Promise<boolean> {
    return !!(await this.readers.delete(id)).affected;
  }
  async listReaders(withResources: boolean): Promise<Attractap[]> {
    return toApplicationRecord(await this.readers.find(withResources ? { relations: ['resources'] } : undefined));
  }
  async findUser(id: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOne({ where: { id } }));
  }
  async saveUser(user: User): Promise<void> {
    await this.users.save(user);
  }
  async cardById(id: number): Promise<NFCCard | null> {
    return toApplicationRecord(await this.cards.findOne({ where: { id }, relations: ['user'] }));
  }
  async cardByUid(uid: string): Promise<NFCCard | null> {
    return toApplicationRecord(await this.cards.findOne({ where: { uid }, relations: ['user'] }));
  }
  async userCards(userId: number): Promise<NFCCard[]> {
    return toApplicationRecord(await this.cards.find({ where: { user: { id: userId } } }));
  }
  async allCards(): Promise<NFCCard[]> {
    return toApplicationRecord(await this.cards.find());
  }
  async registerActiveCard(card: NewCard): Promise<NFCCard> {
    return this.cards.manager.transaction(async (manager) => {
      await manager.update(NFCCard, { user: card.user }, { isActive: false });
      return toApplicationRecord(await manager.save(NFCCard, { ...card, isActive: true }));
    });
  }
  async activateCard(id: number): Promise<NFCCard | null> {
    return this.cards.manager.transaction(async (manager) => {
      const card = await manager.findOne(NFCCard, { where: { id }, relations: ['user'] });
      if (!card) return null;
      await manager
        .createQueryBuilder()
        .update(NFCCard)
        .set({ isActive: false })
        .where({ user: { id: card.user.id } })
        .execute();
      return toApplicationRecord(await manager.save(NFCCard, { ...card, isActive: true }));
    });
  }
  async deactivateCard(id: number): Promise<void> {
    await this.cards.update(id, { isActive: false });
  }
  async removeCard(id: number): Promise<boolean> {
    return !!(await this.cards.delete(id)).affected;
  }
  async touchCard(id: number, at: Date): Promise<void> {
    await this.cards.update(id, { lastSeen: at });
  }
}

@Injectable()
export class TypeormAttractapResourceReader extends AttractapResourceReader {
  constructor(@InjectRepository(Resource) private readonly resources: Repository<Resource>) {
    super();
  }
  async findResource(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id } }));
  }
}
