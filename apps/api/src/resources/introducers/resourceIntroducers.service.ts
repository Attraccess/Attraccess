import { ResourceIntroducerType, type ResourceIntroducerRecord } from '@attraccess/application-models';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

import { NotificationCategory } from '../../notifications/notification-types';

import { ResourceIntroducerChangedEvent } from './events/resource-introducer-changed.event';

import { ResourceIntroducerNameDto } from './dtos/introducerName.dto';

import { RESOURCE_INTRODUCER_STORE, type ResourceIntroducerStore } from './resource-introducer-store.port';

import type { ResourcePersistenceContext } from '../resource-persistence-context';

import { createTranslator } from '../../i18n/translate';

import * as de from './resourceIntroducers.de.json';

import * as en from './resourceIntroducers.en.json';

export const t = createTranslator({ en, de });

type DispatchRecipient = Parameters<NotificationDispatchService['dispatch']>[0]['recipients'][number];

@Injectable()
export class ResourceIntroducersService {
  constructor(
    @Inject(RESOURCE_INTRODUCER_STORE)
    protected readonly store: ResourceIntroducerStore,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly notifications: NotificationDispatchService,
  ) {}

  protected readonly logger = new Logger(ResourceIntroducersService.name);

  public async getMany(resourceId: number, type?: ResourceIntroducerType): Promise<ResourceIntroducerRecord[]> {
    const directIntroducers = await this.store.listDirect(resourceId, type);

    // Introducers granted at the group level apply to every resource in the group,
    // so they must be listed alongside the resource's own introducers.
    const groupIntroducers = await this.store.listViaGroups(resourceId, type);

    // A user can have both roles; prefer a direct grant over an inherited grant of the same role.
    const byUserAndType = new Map<string, ResourceIntroducerRecord>();
    for (const introducer of [...directIntroducers, ...groupIntroducers]) {
      if (!introducer.user) continue;
      const key = `${introducer.userId}:${introducer.type}`;
      if (!byUserAndType.has(key)) {
        byUserAndType.set(key, introducer);
      }
    }

    return Array.from(byUserAndType.values());
  }

  /** Direct and group introducers and maintainers, reduced to what a help panel needs. */
  public async getNames(resourceId: number): Promise<ResourceIntroducerNameDto[]> {
    const byUser = new Map<number, ResourceIntroducerNameDto>();
    for (const introducer of await this.getMany(resourceId)) {
      if (!introducer.user) continue;
      const existing = byUser.get(introducer.userId);
      if (existing?.role === ResourceIntroducerType.INTRODUCER) continue;
      byUser.set(introducer.userId, {
        userId: introducer.userId,
        username: introducer.user.username,
        role: introducer.type,
      });
    }
    return Array.from(byUser.values());
  }

  /**
   * Who may read the full access lists (introductions, introducers, maintainers, history) of a resource:
   * resource and access managers, and introducers of the resource or one of its groups.
   */
  public async canViewAccessLists(
    resourceId: number,
    user: Pick<AuthenticatedUser, 'id' | 'effectivePermissions'>,
  ): Promise<boolean> {
    const permissions = user.effectivePermissions;
    return (
      permissions?.has('resources.update') === true ||
      permissions?.has('resources.access.manage') === true ||
      (await this.isIntroducer(resourceId, user.id, true))
    );
  }

  public async getByResourceIdAndUserId(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
    context?: ResourcePersistenceContext,
  ): Promise<ResourceIntroducerRecord | null> {
    return await this.store.findDirect(resourceId, userId, type, context);
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

    void this.store
      .findUserLocale(userId)
      .then((user) => {
        const recipient = (user ?? { id: userId }) as unknown as DispatchRecipient;
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
  ): Promise<ResourceIntroducerRecord> {
    const existingIntroducer = await this.getByResourceIdAndUserId(resourceId, userId, type);
    if (existingIntroducer) {
      return existingIntroducer;
    }

    let savedIntroducer: ResourceIntroducerRecord;
    try {
      savedIntroducer = await this.store.insert(resourceId, userId, type);
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

    await this.store.remove(introducer.id);
    this.notifyAccessChange(resourceId, userId, introducer.type, false);
    this.eventEmitter.emit(
      ResourceIntroducerChangedEvent.EVENT_NAME,
      new ResourceIntroducerChangedEvent(resourceId, userId),
    );
  }

  public async getManyForResources(
    resourceIds: number[],
    type?: ResourceIntroducerType,
  ): Promise<Map<number, ResourceIntroducerRecord[]>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    const introducersByResourceId = new Map<number, Map<number, ResourceIntroducerRecord>>(
      uniqueResourceIds.map((resourceId) => [resourceId, new Map()]),
    );

    if (uniqueResourceIds.length === 0) {
      return new Map();
    }

    for (const introducer of await this.store.listDirectForResources(uniqueResourceIds, type)) {
      if (introducer.user && introducer.resourceId !== null) {
        introducersByResourceId.get(introducer.resourceId)?.set(introducer.userId, introducer);
      }
    }

    for (const { resourceId, grant } of await this.store.listViaGroupsForResources(uniqueResourceIds, type)) {
      if (grant.user) {
        introducersByResourceId.get(resourceId)?.set(grant.userId, grant);
      }
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
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, ResourceIntroducerType.INTRODUCER, context);
  }

  public async canMaintain(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    return this.hasAccess(resourceId, userId, includeGroups, null, context);
  }

  protected async hasAccess(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    requiredType: ResourceIntroducerType | null,
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    const introducer = await this.getByResourceIdAndUserId(resourceId, userId, requiredType ?? undefined, context);

    if (introducer) {
      return true;
    }

    if (includeGroups) {
      return this.store.hasGroupGrant(resourceId, userId, requiredType, context);
    }

    return false;
  }
}
