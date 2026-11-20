import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ResourceIntroduction, ResourceIntroductionHistoryItem } from '@attraccess/database-entities';
import {
  IntroductionHistoryAction,
  type IntroductionHistoryRecord,
  type IntroductionRecord,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type { ResourceIntroductionStore } from '../../../resources/introductions/resource-introduction-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';
import { toHistoryRecord, toIntroductionRecord } from './introduction-mappers';
import { findRelations } from '../find-options';

@Injectable()
export class TypeOrmResourceIntroductionStore implements ResourceIntroductionStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private manager(context?: ResourcePersistenceContext): EntityManager {
    return managerFor(context, this.dataSource.manager, this.unitOfWork);
  }

  private get introductions() {
    return this.dataSource.getRepository(ResourceIntroduction);
  }

  private get history() {
    return this.dataSource.getRepository(ResourceIntroductionHistoryItem);
  }

  async findOfUser(
    resourceId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionRecord | null> {
    const entity = await this.manager(context)
      .getRepository(ResourceIntroduction)
      .findOne({ where: { resource: { id: resourceId }, receiverUser: { id: userId } } });
    return entity ? toIntroductionRecord(entity) : null;
  }

  async findOfGroupUser(
    groupId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionRecord | null> {
    const entity = await this.manager(context)
      .getRepository(ResourceIntroduction)
      .findOne({ where: { resourceGroup: { id: groupId }, receiverUser: { id: userId } } });
    return entity ? toIntroductionRecord(entity) : null;
  }

  async listForGroup(groupId: number): Promise<IntroductionRecord[]> {
    const rows = await this.introductions.find({
      where: { resourceGroup: { id: groupId } },
      relations: { receiverUser: true, tutorUser: true, history: true },
      cache: false,
    });
    return rows.map(toIntroductionRecord);
  }

  async historyOfGroupUser(groupId: number, userId: number): Promise<IntroductionHistoryRecord[]> {
    const rows = await this.history.find({
      where: { introduction: { resourceGroup: { id: groupId }, receiverUser: { id: userId } } },
    });
    return rows.map(toHistoryRecord);
  }

  async createForGroup(groupId: number, userId: number, tutorUserId?: number): Promise<IntroductionRecord> {
    const saved = await this.introductions.save(
      this.introductions.create({
        resourceGroup: { id: groupId },
        receiverUser: { id: userId },
        ...(tutorUserId != null ? { tutorUser: { id: tutorUserId } } : {}),
      }),
    );
    return toIntroductionRecord(saved);
  }

  async findById(introductionId: number): Promise<IntroductionRecord | null> {
    const entity = await this.introductions.findOne({ where: { id: introductionId } });
    return entity ? toIntroductionRecord(entity) : null;
  }

  async lastHistoryItem(
    introductionId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionHistoryRecord | null> {
    const item = await this.manager(context)
      .getRepository(ResourceIntroductionHistoryItem)
      .findOne({
        where: { introduction: { id: introductionId } },
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    return item ? toHistoryRecord(item) : null;
  }

  async latestGrant(introductionId: number): Promise<IntroductionHistoryRecord | null> {
    const item = await this.history.findOne({
      where: { introduction: { id: introductionId }, action: IntroductionHistoryAction.GRANT },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return item ? toHistoryRecord(item) : null;
  }

  async listForResource(resourceId: number, includeGroups: boolean): Promise<IntroductionRecord[]> {
    const rows = await this.introductions.find({
      where: includeGroups
        ? [{ resource: { id: resourceId } }, { resourceGroup: { resources: { id: resourceId } } }]
        : { resource: { id: resourceId } },
      relations: findRelations(['receiverUser', 'tutorUser', 'history', ...(includeGroups ? ['resourceGroup'] : [])]),
      cache: false,
    });
    return rows.map(toIntroductionRecord);
  }

  async historyOfUser(resourceId: number, userId: number): Promise<IntroductionHistoryRecord[]> {
    const rows = await this.history.find({
      where: { introduction: { resource: { id: resourceId }, receiverUser: { id: userId } } },
    });
    return rows.map(toHistoryRecord);
  }

  async create(resourceId: number, userId: number, tutorUserId?: number): Promise<IntroductionRecord> {
    const saved = await this.introductions.save(
      this.introductions.create({
        resource: { id: resourceId },
        receiverUser: { id: userId },
        ...(tutorUserId != null ? { tutorUser: { id: tutorUserId } } : {}),
      }),
    );
    return toIntroductionRecord(saved);
  }

  async setTutor(introductionId: number, tutorUserId: number): Promise<void> {
    await this.introductions.update(introductionId, { tutorUserId });
  }

  async addHistoryItem(
    introductionId: number,
    action: IntroductionHistoryAction,
    comment: string | undefined,
    performedByUserId: number,
  ): Promise<IntroductionHistoryRecord> {
    const saved = await this.history.save(
      this.history.create({
        introduction: { id: introductionId },
        action,
        comment,
        performedByUser: { id: performedByUserId },
      }),
    );
    return {
      id: saved.id,
      introductionId,
      action,
      performedByUserId,
      comment: saved.comment ?? null,
      createdAt: saved.createdAt,
    };
  }

  async listWithRetrainingRule(): Promise<IntroductionRecord[]> {
    const rows = await this.introductions
      .createQueryBuilder('introduction')
      .leftJoinAndSelect('introduction.receiverUser', 'receiverUser')
      .leftJoin('introduction.resource', 'resource')
      .leftJoin('introduction.resourceGroup', 'resourceGroup')
      .where('resource.retrainingMaxAgeDays IS NOT NULL')
      .orWhere('resource.retrainingMaxInactivityDays IS NOT NULL')
      .orWhere('resourceGroup.retrainingMaxAgeDays IS NOT NULL')
      .orWhere('resourceGroup.retrainingMaxInactivityDays IS NOT NULL')
      .getMany();
    return rows.map((row) => ({
      ...toIntroductionRecord(row),
      receiver: row.receiverUser
        ? {
            id: row.receiverUser.id,
            username: row.receiverUser.username,
            email: row.receiverUser.email,
            locale: row.receiverUser.locale,
          }
        : null,
    }));
  }

  async markRetrainingRequiredAudited(introductionId: number, at: Date): Promise<void> {
    await this.introductions.update(introductionId, { retrainingRequiredAuditedAt: at });
  }

  async markRetrainingNotified(introductionId: number, at: Date): Promise<void> {
    await this.introductions.update(introductionId, { retrainingNotifiedAt: at });
  }
}
