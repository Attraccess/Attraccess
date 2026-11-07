import { Resource, User } from '@attraccess/database-entities';
import type { PluginNotificationsContext, PluginResourceAccessContext } from '@attraccess/plugins-backend-sdk';
import type { Type } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { PluginEmailService } from '../../email/plugin-email.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { ResourceActivityVisibilityService } from '../../resources/usage/authorization/resource-activity-visibility.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { createPluginNotificationsContext } from './plugin-notifications';
import { createResourceAccessContext } from './resource-access';

/** Lazy accessors to host singletons; each call throws until the host finished bootstrapping. */
export interface PluginHostRefs {
  get<T>(token: Type<T>): T;
  dataSource(): DataSource;
}

/** `context.notifications` wired to the host's dispatcher and email service. */
export function createHostNotificationsContext(pluginName: string, host: PluginHostRefs): PluginNotificationsContext {
  return createPluginNotificationsContext(pluginName, () => ({
    dispatcher: host.get(NotificationDispatchService),
    email: host.get(PluginEmailService),
    findUsers: (userIds) =>
      host
        .dataSource()
        .getRepository(User)
        .find({ where: { id: In(userIds) } }),
  }));
}

/** `context.resourceAccess` wired to the host's authorization and maintenance services. */
export function createHostResourceAccessContext(host: PluginHostRefs): PluginResourceAccessContext {
  return createResourceAccessContext(() => ({
    usage: host.get(ResourceUsageService),
    maintenance: host.get(ResourceMaintenanceService),
    rbac: host.get(RbacService),
    visibility: host.get(ResourceActivityVisibilityService),
    findUser: (userId) =>
      host
        .dataSource()
        .getRepository(User)
        .findOne({ where: { id: userId } }),
    findResource: (resourceId) =>
      host
        .dataSource()
        .getRepository(Resource)
        .findOne({ where: { id: resourceId }, select: { id: true, supervisionMode: true } }),
    listResourceIds: async () =>
      (
        await host
          .dataSource()
          .getRepository(Resource)
          .find({ select: { id: true } })
      ).map((resource) => resource.id),
  }));
}
