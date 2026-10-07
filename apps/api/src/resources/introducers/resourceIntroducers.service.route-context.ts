import { createTranslator } from '../../i18n/translate';
import * as de from './resourceIntroducers.de.json';
import * as en from './resourceIntroducers.en.json';
import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, Repository } from 'typeorm';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

export const t = createTranslator({ en, de });

export abstract class ResourceIntroducersServiceRouteContext {
  protected abstract readonly userRepository: Repository<User>;
  protected abstract readonly notifications: NotificationDispatchService;
  protected abstract readonly logger: Logger;
  protected abstract readonly resourceIntroducerRepository: Repository<ResourceIntroducer>;
  public abstract getByResourceIdAndUserId(
    resourceId: number,
    userId: number,
    type?: ResourceIntroducerType,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroducer | null>;
  protected abstract notifyAccessChange(
    resourceId: number,
    userId: number,
    type: ResourceIntroducerType,
    granted: boolean,
  ): void;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract hasAccess(
    resourceId: number,
    userId: number,
    includeGroups: boolean,
    requiredType: ResourceIntroducerType | null,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean>;
}
