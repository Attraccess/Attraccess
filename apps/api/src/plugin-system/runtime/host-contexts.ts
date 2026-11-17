import type {
  PluginHostDataContext,
  PluginNotificationsContext,
  PluginResourceAccessContext,
} from '@attraccess/plugins-backend-sdk';
import type { Type } from '@nestjs/common';
import { PluginEmailService } from '../../email/plugin-email.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { ResourceActivityVisibilityService } from '../../resources/usage/authorization/resource-activity-visibility.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import {
  PLUGIN_CORE_LOOKUP,
  PLUGIN_HOST_DATA,
  type PluginCoreLookupPort,
  type PluginHostDataPort,
} from '../persistence/plugin-host-data.port';
import { createPluginNotificationsContext } from './plugin-notifications';
import { createResourceAccessContext } from './resource-access';

/** Lazy accessors to host singletons; each call throws until the host finished bootstrapping. */
export interface PluginHostRefs {
  get<T>(token: Type<T> | symbol): T;
}

/** `context.notifications` wired to the host's dispatcher and email service. */
export function createHostNotificationsContext(pluginName: string, host: PluginHostRefs): PluginNotificationsContext {
  return createPluginNotificationsContext(pluginName, () => ({
    dispatcher: host.get(NotificationDispatchService),
    email: host.get(PluginEmailService),
    findUsers: (userIds) => host.get<PluginCoreLookupPort>(PLUGIN_CORE_LOOKUP).findRecipients(userIds),
  }));
}

/** `context.resourceAccess` wired to the host's authorization and maintenance services. */
export function createHostResourceAccessContext(host: PluginHostRefs): PluginResourceAccessContext {
  return createResourceAccessContext(() => {
    const lookup = host.get<PluginCoreLookupPort>(PLUGIN_CORE_LOOKUP);
    return {
      usage: host.get(ResourceUsageService),
      maintenance: host.get(ResourceMaintenanceService),
      rbac: host.get(RbacService),
      visibility: host.get(ResourceActivityVisibilityService),
      findUser: (userId) => lookup.findUser(userId),
      findResource: (resourceId) => lookup.findResourceSupervision(resourceId),
      listResourceIds: () => lookup.listResourceIds(),
    };
  });
}

/**
 * `context.hostData`. Every call resolves the host adapter when it is made, so a directory a plugin retained during
 * bootstrap keeps working once the host finished starting.
 */
export function createHostDataContext(host: PluginHostRefs): PluginHostDataContext {
  const directory = <K extends keyof PluginHostDataContext>(name: K): PluginHostDataContext[K] =>
    new Proxy({} as PluginHostDataContext[K], {
      get:
        (_, method) =>
        (...args: unknown[]) =>
          (
            host.get<PluginHostDataPort>(PLUGIN_HOST_DATA)[name] as unknown as Record<
              string | symbol,
              (...a: unknown[]) => unknown
            >
          )[method](...args),
    });
  return {
    resources: directory('resources'),
    users: directory('users'),
    settings: directory('settings'),
    flows: directory('flows'),
  };
}
