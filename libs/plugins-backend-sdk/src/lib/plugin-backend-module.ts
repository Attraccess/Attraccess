import type { PluginContext } from './plugin-context';
import { DynamicModule } from '@nestjs/common';
import type { PluginEntityClass } from './entity';
import type { MqttCredentialProvisioningProviderFactory } from './mqtt-credential-provisioning';
import type { PluginAuditDomainDeclaration } from './plugin-audit';
import type { PluginFlowNodeDefinition } from './plugin-flow-node';

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
}
