import {
  Resource,
  ResourceGroup,
  ResourceUsage,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { toApplicationRecord } from '../../../database/sqlite/backend';
import { ResourceRetrainingPersistence } from './port';

@Injectable()
export class TypeormResourceRetrainingPersistence extends ResourceRetrainingPersistence {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceGroup) private readonly groups: Repository<ResourceGroup>,
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(ResourceIntroduction) private readonly introductions: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    private readonly history: Repository<ResourceIntroductionHistoryItem>,
  ) {
    super();
  }
  async introduction(id: number): Promise<ResourceIntroduction | null> {
    return toApplicationRecord(await this.introductions.findOne({ where: { id } }));
  }
  async resourceIntroduction(resourceId: number, userId: number): Promise<ResourceIntroduction | null> {
    return toApplicationRecord(
      await this.introductions.findOne({ where: { resource: { id: resourceId }, receiverUser: { id: userId } } }),
    );
  }
  async groupIntroduction(groupId: number, userId: number): Promise<ResourceIntroduction | null> {
    return toApplicationRecord(
      await this.introductions.findOne({ where: { resourceGroup: { id: groupId }, receiverUser: { id: userId } } }),
    );
  }
  async resource(id: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id } }));
  }
  async group(id: number): Promise<ResourceGroup | null> {
    return toApplicationRecord(await this.groups.findOne({ where: { id } }));
  }
  async groupWithResources(id: number): Promise<ResourceGroup | null> {
    return toApplicationRecord(await this.groups.findOne({ where: { id }, relations: ['resources'] }));
  }
  async latestHistory(
    introductionId: number,
    action?: IntroductionHistoryAction,
  ): Promise<ResourceIntroductionHistoryItem | null> {
    return toApplicationRecord(
      await this.history.findOne({
        where: { introduction: { id: introductionId }, ...(action !== undefined ? { action } : {}) },
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
  }
  async resourceLastUsedAt(resourceId: number, userId: number): Promise<Date | null> {
    return (
      (await this.usages.findOne({ where: { resourceId, userId, endTime: Not(IsNull()) }, order: { endTime: 'DESC' } }))
        ?.endTime ?? null
    );
  }
  async resourcesLastUsedAt(resourceIds: readonly number[], userId: number): Promise<Date | null> {
    if (!resourceIds.length) return null;
    return (
      (
        await this.usages.findOne({
          where: { resourceId: In([...resourceIds]), userId, endTime: Not(IsNull()) },
          order: { endTime: 'DESC' },
        })
      )?.endTime ?? null
    );
  }
  async configuredIntroductions(): Promise<ResourceIntroduction[]> {
    return toApplicationRecord(
      await this.introductions
        .createQueryBuilder('introduction')
        .leftJoinAndSelect('introduction.receiverUser', 'receiverUser')
        .leftJoin('introduction.resource', 'resource')
        .leftJoin('introduction.resourceGroup', 'resourceGroup')
        .where('resource.retrainingMaxAgeDays IS NOT NULL')
        .orWhere('resource.retrainingMaxInactivityDays IS NOT NULL')
        .orWhere('resourceGroup.retrainingMaxAgeDays IS NOT NULL')
        .orWhere('resourceGroup.retrainingMaxInactivityDays IS NOT NULL')
        .getMany(),
    );
  }
  async stampRequiredAudit(id: number, at: Date): Promise<void> {
    await this.introductions.update(id, { retrainingRequiredAuditedAt: at });
  }
  async stampNotification(id: number, at: Date): Promise<void> {
    await this.introductions.update(id, { retrainingNotifiedAt: at });
  }
}
