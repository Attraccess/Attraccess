import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  MqttCredentialProvisioningProvider,
  MqttCredentialProvisioningHostProvider,
  MqttCredentialRequest,
  ManualMqttCredentialInstructions,
  MqttServerConnectionConfig,
  ProvisionedMqttCredential,
} from '@attraccess/plugins-backend-sdk';
import { MqttServerHostProviderService } from './mqtt-server-host.provider';

export interface MqttCredentialProviderAvailability {
  readonly providerId: string;
  readonly displayName: string;
}

/**
 * Host-owned registry and selector for broker plugins. Providers are registered
 * while plugins load and selected only after the configured MQTT server is read.
 */
@Injectable()
export class MqttCredentialProvisioningService implements MqttCredentialProvisioningHostProvider {
  private static readonly providers = new Map<string, MqttCredentialProvisioningProvider>();

  constructor(private readonly mqttServers: MqttServerHostProviderService) {}

  static register(provider: MqttCredentialProvisioningProvider): void {
    // Test application contexts and plugin reloads may initialise the same
    // plugin more than once; the most recent instance owns its capability.
    this.providers.set(provider.id, provider);
  }

  async availableProviders(mqttServerId: number): Promise<MqttCredentialProviderAvailability[]> {
    const config = await this.requireServer(mqttServerId);
    const providers = await this.compatibleProviders(config);
    return providers.map(({ id, displayName }) => ({ providerId: id, displayName }));
  }

  async provision(
    request: MqttCredentialRequest,
  ): Promise<ProvisionedMqttCredential | ManualMqttCredentialInstructions> {
    const provider = await this.providerFor(request.mqttServerId);
    return provider ? provider.provision(request) : this.manualInstructions('provision', request);
  }

  async rotate(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential | ManualMqttCredentialInstructions> {
    const provider = await this.providerFor(request.mqttServerId);
    return provider ? provider.rotate(request) : this.manualInstructions('rotate', request);
  }

  async revoke(
    request: Pick<MqttCredentialRequest, 'mqttServerId' | 'identity' | 'username' | 'vhost'>,
  ): Promise<void | ManualMqttCredentialInstructions> {
    const provider = await this.providerFor(request.mqttServerId);
    if (!provider) {
      return this.manualInstructions('revoke', { ...request, topicPolicy: { publish: [], subscribe: [] } });
    }
    await provider.revoke(request);
  }

  private async providerFor(mqttServerId: number): Promise<MqttCredentialProvisioningProvider | null> {
    const providers = await this.compatibleProviders(await this.requireServer(mqttServerId));
    if (providers.length > 1) {
      throw new Error(
        `Multiple MQTT credential providers support server ${mqttServerId}; provider selection is ambiguous.`,
      );
    }
    return providers[0] ?? null;
  }

  private async compatibleProviders(config: MqttServerConnectionConfig): Promise<MqttCredentialProvisioningProvider[]> {
    const supported = await Promise.all(
      [...MqttCredentialProvisioningService.providers.values()].map(async (provider) =>
        (await provider.supports(config)) ? provider : null,
      ),
    );
    return supported.filter((provider): provider is MqttCredentialProvisioningProvider => provider !== null);
  }

  private async requireServer(mqttServerId: number): Promise<MqttServerConnectionConfig> {
    const server = await this.mqttServers.getServerConfig(mqttServerId);
    if (!server) {
      throw new NotFoundException('MQTT server not found.');
    }
    return server;
  }

  private manualInstructions(
    operation: 'provision' | 'rotate' | 'revoke',
    request: MqttCredentialRequest,
  ): ManualMqttCredentialInstructions {
    const instructions =
      operation === 'provision'
        ? [
            `Create MQTT user "${request.username}" in vhost "${request.vhost}" with a newly generated password.`,
            `Allow publish only to: ${request.topicPolicy.publish.join(', ') || '(none)'}.`,
            `Allow subscribe only to: ${request.topicPolicy.subscribe.join(', ') || '(none)'}.`,
          ]
        : operation === 'rotate'
          ? [
              `Replace the password for MQTT user "${request.username}" in vhost "${request.vhost}".`,
              `Reconcile publish access to only: ${request.topicPolicy.publish.join(', ') || '(none)'}.`,
              `Reconcile subscribe access to only: ${request.topicPolicy.subscribe.join(', ') || '(none)'}.`,
            ]
          : [`Remove or disable MQTT user "${request.username}" and its ACLs in vhost "${request.vhost}".`];

    return {
      mqttServerId: request.mqttServerId,
      username: request.username,
      vhost: request.vhost,
      publishTopics: request.topicPolicy.publish,
      subscribeTopics: request.topicPolicy.subscribe,
      instructions: [
        ...instructions,
        'Do not grant wildcard, administrator, configure, or cross-device permissions.',
        ...(operation === 'revoke'
          ? []
          : ['Deliver the generated password once to the device installer; do not persist it in Attraccess.']),
      ],
    };
  }
}
