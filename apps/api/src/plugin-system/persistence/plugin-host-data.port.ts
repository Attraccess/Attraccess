import type { SupervisionMode } from '@attraccess/application-models';
import type { PluginHostDataContext } from '@attraccess/plugins-backend-sdk';
import type { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import type { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';

/**
 * DI token of the host-side data lookups behind `PluginContext.hostData`. The adapter answers with neutral models and
 * plain values; the permission guard of each group is applied by the plugin sandbox, not here.
 */
export const PLUGIN_HOST_DATA = Symbol.for('attraccess.plugin-system.host-data');
export type PluginHostDataPort = PluginHostDataContext;

/** The user record core services take for an authorization question. Derived from the service so it follows it. */
export type PluginCoreUser = NonNullable<Parameters<ResourceUsageService['canControllResource']>[1]>;
/** A notification recipient as the dispatcher takes it. */
export type PluginNotificationRecipient = Parameters<NotificationDispatchService['dispatch']>[0]['recipients'][number];

/**
 * DI token of the lookups the plugin runtime needs to call core services on behalf of a plugin (authorization
 * queries and notification dispatch). Unlike {@link PLUGIN_HOST_DATA} these hand core services the records they
 * expect; they are never exposed to plugins.
 */
export const PLUGIN_CORE_LOOKUP = Symbol.for('attraccess.plugin-system.core-lookup');
export interface PluginCoreLookupPort {
  findUser(userId: number): Promise<PluginCoreUser | null>;
  findRecipients(userIds: number[]): Promise<PluginNotificationRecipient[]>;
  findResourceSupervision(resourceId: number): Promise<{ id: number; supervisionMode: SupervisionMode } | null>;
  listResourceIds(): Promise<number[]>;
}

/** DI token of the host connection the plugin runtime hands to its persistence adapter. Opaque to application code. */
export const PLUGIN_HOST_CONNECTION = Symbol.for('attraccess.plugin-system.host-connection');
