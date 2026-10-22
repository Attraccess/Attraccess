import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/application-models';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { ResourceIntroducerPersistence, RESOURCE_INTRODUCER_OPERATIONS } from './persistence/port';

import { TransactionScope } from '../../database/transaction-scope';

import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

import { NotificationCategory } from '../../notifications/notification-types';

import { ResourceIntroducerChangedEvent } from './events/resource-introducer-changed.event';

import { createTranslator } from '../../i18n/translate';

import * as de from './resourceIntroducers.de.json';

import * as en from './resourceIntroducers.en.json';

export const t = createTranslator({ en, de });

@Injectable()
export class ResourceIntroducersService {
  constructor(
    @Inject(ResourceIntroducerPersistence) protected readonly persistence: ResourceIntroducerPersistence,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly notifications: NotificationDispatchService,
  ) {}

  protected readonly logger = new Logger(ResourceIntroducersService.name);

  public async getMany(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducer[]> {
    const directIntroducers = await this.persistence.directGrants([resourceId], type);
    const groupIntroducers = await this.persistence.groupGrants(resourceId, type);

    // A user can have both roles; prefer a direct grant over an inherited grant of the same role.
    const byUserAndType = new Map<string, ResourceIntroducer>();
    for (const introducer of [...directIntroducers, ...groupIntroducers]) {
      if (!introducer.user) continue;
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
    transactionalEntityManager?: TransactionScope,
  ): Promise<ResourceIntroducer | null> {
    return this.operations(transactionalEntityManager).directGrant(resourceId, userId, type);
  }

  protected operations(scope?: TransactionScope): ResourceIntroducerPersistence {
    return scope ? scope.resolve(RESOURCE_INTRODUCER_OPERATIONS) : this.persistence;
  }

  protected notifyAccessChange(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType,
    granted: boolean,
  ): void {
    const url = `/resources/${resourceId}`;
    const bodyKey =
      type === ResourceIntroducerType.MAINTAINER
        ? granted
          ? 'grantedMaintainer'
          : 'revokedMaintainer'
        : granted
          ? 'grantedIntroducer'
          : 'revokedIntroducer';

    void this.persistence
      .recipient(userId)
      .then((user) => {
        const recipient = (user ?? { id: userId }) as User; // Dispatch accepts the existing id/locale projection.
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

  public async grant(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceIdAndUserId(resourceId, userId, type);
    if (existingIntroducer) {
      return existingIntroducer;
    }

    let savedIntroducer: ResourceIntroducer;
    try {
      savedIntroducer = await this.persistence.createGrant(resourceId, userId, type);
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

    await this.persistence.removeGrant(introducer);
    this.notifyAccessChange(resourceId, userId, introducer.type, false);
    this.eventEmitter.emit(
      ResourceIntroducerChangedEvent.EVENT_NAME,
      new ResourceIntroducerChangedEvent(resourceId, userId),
    );
  }

  public async getManyForResources(
    resourceIds: number[],
    type?: ResourceIntroducerType,
  ): Promise<Map<number, ResourceIntroducer[]>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    const introducersByResourceId = new Map<number, Map<number, ResourceIntroducer>>(
      uniqueResourceIds.map((resourceId) => [resourceId, new Map()]),
    );

    if (uniqueResourceIds.length === 0) {
      return new Map();
    }

    const directIntroducers = await this.persistence.directGrants(uniqueResourceIds, type);
    for (const introducer of directIntroducers) {
      if (introducer.user) introducersByResourceId.get(introducer.resourceId)?.set(introducer.userId, introducer);
    }

    const inherited = await this.persistence.inheritedGrants(uniqueResourceIds, type);
    for (const { resourceId, grant } of inherited) {
      if (grant.user) introducersByResourceId.get(resourceId)?.set(grant.userId, grant);
    }

    return new Map(
      Array.from(introducersByResourceId, ([resourceId, introducers]) => [
        resourceId,
        Array.from(introducers.values()),
      ]),
    );
  }

  public async isIntroducer(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    transactionalEntityManager?: TransactionScope,
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
    transactionalEntityManager?: TransactionScope,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, null, transactionalEntityManager);
  }

  protected async hasAccess(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    requiredType: ResourceIntroducerType | null,
    transactionalEntityManager?: TransactionScope,
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

    if (includeGroups)
      return this.operations(transactionalEntityManager).hasGroupGrant(resourceId, userId, requiredType);

    return false;
  }
}
