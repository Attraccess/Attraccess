import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ResourceIntroducerChangedEvent } from './events/resource-introducer-changed.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { createTranslator } from '../../i18n/translate';
import * as en from './resourceIntroducers.en.json';
import * as de from './resourceIntroducers.de.json';

const t = createTranslator({ en, de });

@Injectable()
export class ResourceIntroducersService {
  private readonly logger = new Logger(ResourceIntroducersService.name);

  constructor(
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private notifyAccessChange(resourceId: number, userId: number, type: ResourceIntroducerType, granted: boolean): void {
    const url = `/resources/${resourceId}`;
    const bodyKey =
      type === ResourceIntroducerType.MAINTAINER
        ? granted
          ? 'grantedMaintainer'
          : 'revokedMaintainer'
        : granted
          ? 'grantedIntroducer'
          : 'revokedIntroducer';

    void this.userRepository
      .findOne({ where: { id: userId }, select: ['id', 'locale'] })
      .then((user) => {
        const recipient = user ?? ({ id: userId } as User);
        return this.notifications.dispatch({
          category: NotificationCategory.ACCESS_CHANGES,
          recipients: [recipient],
          title: (r) => t(r.locale, 'title'),
          body: (r) => t(r.locale, bodyKey, { resourceId }),
          url,
          dedupeKey: `resource-access-${resourceId}-${userId}-${bodyKey}`,
          sendEmail: (r) =>
            this.notifications.sendEmailTemplate(r, NotificationCategory.ACCESS_CHANGES, {
              accessChange: {
                title: t(r.locale, 'title'),
                body: t(r.locale, bodyKey, { resourceId }),
                url,
              },
            }),
        });
      })
      .catch((error) => {
        this.logger.error(`Failed to notify user ${userId} about resource access changes: ${(error as Error).message}`);
      });
  }

  public async getMany(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer[]> {
    const directIntroducers = await this.resourceIntroducerRepository.find({
      where: { resourceId, ...(type ? { type } : {}) },
      relations: ['user'],
    });

    // Introducers granted at the group level apply to every resource in the group,
    // so they must be listed alongside the resource's own introducers.
    const groupQuery = this.resourceIntroducerRepository
      .createQueryBuilder('introducer')
      .leftJoinAndSelect('introducer.user', 'user')
      .innerJoin('introducer.resourceGroup', 'group')
      .innerJoin('group.resources', 'resource')
      .where('resource.id = :resourceId', { resourceId });

    if (type) {
      groupQuery.andWhere('introducer.type = :type', { type });
    }

    const groupIntroducers = await groupQuery.getMany();

    // A user can have both roles; prefer a direct grant over an inherited grant of the same role.
    const byUserAndType = new Map<string, ResourceIntroducer>();
    for (const introducer of [...directIntroducers, ...groupIntroducers]) {
      const key = `${introducer.userId}:${introducer.type}`;
      if (!byUserAndType.has(key)) {
        byUserAndType.set(key, introducer);
      }
    }

    return Array.from(byUserAndType.values());
  }

  public async getByResourceIdAndUserId(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroducer | null> {
    const resourceIntroducerRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroducer)
      : this.resourceIntroducerRepository;

    return await resourceIntroducerRepository.findOne({ where: { resourceId, userId, ...(type ? { type } : {}) } });
  }

  public async grant(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceIdAndUserId(resourceId, userId, type);
    if (existingIntroducer) {
      return existingIntroducer;
    }

    const introducer = this.resourceIntroducerRepository.create({ resourceId, userId, type });
    let savedIntroducer: ResourceIntroducer;
    try {
      savedIntroducer = await this.resourceIntroducerRepository.save(introducer);
    } catch (error) {
      const concurrentGrant = await this.getByResourceIdAndUserId(resourceId, userId, type);
      if (concurrentGrant) {
        return concurrentGrant;
      }
      throw error;
    }
    this.notifyAccessChange(resourceId, userId, type, true);
    this.eventEmitter.emit(
      ResourceIntroducerChangedEvent.EVENT_NAME,
      new ResourceIntroducerChangedEvent(resourceId, userId),
    );
    return savedIntroducer;
  }

  public async revoke(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<void> {
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId, type);
    if (!introducer) {
      return;
    }

    await this.resourceIntroducerRepository.remove(introducer);
    this.notifyAccessChange(resourceId, userId, introducer.type, false);
    this.eventEmitter.emit(
      ResourceIntroducerChangedEvent.EVENT_NAME,
      new ResourceIntroducerChangedEvent(resourceId, userId),
    );
  }

  public async isIntroducer(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.hasAccess(
      resourceId,
      userId,
      includeGroups,
      ResourceIntroducerType.INTRODUCER,
      transactionalEntityManager,
    );
  }

  public async canMaintain(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, null, transactionalEntityManager);
  }

  private async hasAccess(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    requiredType: ResourceIntroducerType | null,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const introducer = await this.getByResourceIdAndUserId(
      resourceId,
      userId,
      requiredType ?? undefined,
      transactionalEntityManager,
    );

    if (introducer) {
      return true;
    }

    if (includeGroups) {
      const resourceIntroducerRepository = transactionalEntityManager
        ? transactionalEntityManager.getRepository(ResourceIntroducer)
        : this.resourceIntroducerRepository;

      const query = resourceIntroducerRepository
        .createQueryBuilder('introducer')
        .leftJoin('introducer.resourceGroup', 'group')
        .leftJoin('group.resources', 'resource')
        .where('resource.id = :resourceId', { resourceId })
        .andWhere('introducer.userId = :userId', { userId });

      if (requiredType !== null) {
        query.andWhere('introducer.type = :requiredType', { requiredType });
      }

      const groupIntroducers = await query.getMany();

      return groupIntroducers.length > 0;
    }

    return false;
  }
}
