import type { PluginContext } from './plugin-context';
import { DynamicModule } from '@nestjs/common';
import type { PluginEntityClass } from './entity';
import type { MqttCredentialProvisioningProviderFactory } from './mqtt-credential-provisioning';
import type { PluginAuditDomainDeclaration } from './plugin-audit';
import type { PluginFlowNodeDefinition } from './plugin-flow-node';
import type { PluginEmailTemplate, PluginNotificationCategory } from './plugin-notifications';
import type { PreStartHook, ReaderUiProvider, SessionEndHook, StartBlockedQuery, StartCapacityHook } from './reader-ui';

/**
 * Shape every backend plugin's default export must satisfy. The host calls
 * register(context) at load time to obtain the plugin's Nest module definition.
 */
export interface PluginBackendModule {
  register(context: PluginContext): DynamicModule;

  /**
   * Optional TypeORM entity classes this plugin owns. The host registers their
   * metadata into the shared DataSource at load time so the plugin can query
   * them through {@link PluginContext.getRepository}. The schema itself is owned
   * by the plugin's migrations (the host runs with `synchronize: false`), so an
   * entity here describes an existing table rather than creating one. Requires
   * the DATABASE_ACCESS permission. See `docs/en/plugins/database-migrations.md`.
   */
  entities?: PluginEntityClass[];

  /**
   * Optional custom flow node types this plugin contributes. The host registers
   * them into the flow engine so they appear in the frontend node catalog and
   * can be executed like built-in node types. No extra permission is required.
   *
   * Type naming convention: "plugin.<pluginName>.<nodeName>".
   */
  flowNodes?: PluginFlowNodeDefinition[] | ((context: PluginContext) => PluginFlowNodeDefinition[]);

  /**
   * Optional audit domains this plugin contributes. The host registers the
   * declarations at load time and enforces them on every event the plugin
   * records through {@link PluginContext.audit}: only declared actions, subject
   * types and detail fields are accepted, and events are stored under the
   * declared domain. Domains must not collide with host domains or with other
   * plugins. No extra permission is required.
   */
  auditDomains?: PluginAuditDomainDeclaration[] | ((context: PluginContext) => PluginAuditDomainDeclaration[]);

  /** Optional broker credential provider offered to other integrations by this plugin. */
  credentialProvisioningProvider?: MqttCredentialProvisioningProviderFactory;

  /** Optional reader UI slot provider. Requires the READER_UI permission. */
  readerUi?: ReaderUiProvider | ((context: PluginContext) => ReaderUiProvider);

  /** Optional pre-start hook (allow / confirm / block). Requires ACCESS_HOOKS. */
  preStartHook?: PreStartHook;

  /**
   * Optional query-side counterpart of `preStartHook`: reports a "start currently blocked" state the resource UI
   * shows in place of the start button. Informational; the pre-start hook stays the gate. Requires ACCESS_HOOKS.
   */
  startBlockedQuery?: StartBlockedQuery;

  /**
   * Optional atomic capacity hook: tells the host how many slots of a shared machine the plugin holds back from the
   * starter. The host evaluates it inside its serialized start transaction. Requires ACCESS_HOOKS.
   */
  startCapacityHook?: StartCapacityHook;

  /** Optional advisory hook after a session ended. Requires ACCESS_HOOKS. */
  sessionEndHook?: SessionEndHook;

  /**
   * Optional notification categories this plugin dispatches under. They appear in user notification
   * preferences grouped under the plugin name as `plugin.<pluginName>.<id>`. Dispatching requires the
   * SEND_NOTIFICATIONS permission; declaring categories without it quarantines the plugin.
   */
  notificationCategories?: PluginNotificationCategory[];

  /**
   * Optional email templates, stored and edited like core templates (key `plugin.<pluginName>.<id>`) and sent
   * through `notifications.dispatch({ email: { template, variables } })`. Declaring them requires the
   * SEND_NOTIFICATIONS permission; without it the plugin is quarantined.
   */
  emailTemplates?: PluginEmailTemplate[];
}
