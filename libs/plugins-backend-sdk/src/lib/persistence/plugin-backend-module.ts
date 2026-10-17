import type { DynamicModule } from '@nestjs/common';
import type { PluginAuditDomainDeclaration } from '../plugin-audit';
import type { PluginFlowNodeDefinition } from '../plugin-flow-node';
import type { MqttCredentialProvisioningProvider, PluginContext } from './plugin-context';

export interface PluginPersistenceDeclaration {
  readonly contractVersion: 2;
  /** Only engines for which this plugin ships implementations may be listed. */
  readonly supportedBackends: readonly string[];
}

export type MqttCredentialProvisioningProviderFactory = (context: PluginContext) => MqttCredentialProvisioningProvider;

/** Application entry. Backend registrations are supplied separately through the adapter entry. */
export interface PluginBackendModule {
  readonly persistence: PluginPersistenceDeclaration;
  register(context: PluginContext): DynamicModule;
  readonly flowNodes?: PluginFlowNodeDefinition[] | ((context: PluginContext) => PluginFlowNodeDefinition[]);
  readonly auditDomains?: PluginAuditDomainDeclaration[] | ((context: PluginContext) => PluginAuditDomainDeclaration[]);
  readonly credentialProvisioningProvider?: MqttCredentialProvisioningProviderFactory;
}
