import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { NotificationCategory } from '../../notifications/notification-types';
import { ResourceIntroducerChangedEvent } from './events/resource-introducer-changed.event';
import { ResourceIntroducerAccessImplementation } from './resource-introducer-access';
import { t } from './resourceIntroducers.service.route-context';
export abstract class ResourceIntroducerWritingImplementation extends ResourceIntroducerAccessImplementation {
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
}
