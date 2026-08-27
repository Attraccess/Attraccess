import type { MqttServerConnectionConfig, PluginContext } from './plugin-context';

/** Broker-neutral topic policy supplied by an integration for one MQTT identity. */
export interface MqttTopicPolicy {
  readonly publish: readonly string[];
  readonly subscribe: readonly string[];
}

/** The broker identity an integration wants to install on a device. */
export interface MqttCredentialRequest {
  readonly mqttServerId: number;
  readonly identity: string;
  readonly username: string;
  readonly vhost: string;
  readonly topicPolicy: MqttTopicPolicy;
}

/** The password is deliberately present only on create and rotate responses. */
export interface ProvisionedMqttCredential {
  readonly providerId: string;
  readonly identity: string;
  readonly username: string;
  readonly vhost: string;
  readonly password: string;
}

/** A provider supplied by a broker plugin. It never exposes broker details to integrations. */
export interface MqttCredentialProvisioningProvider {
  readonly id: string;
  readonly displayName: string;
  supports(config: MqttServerConnectionConfig): Promise<boolean>;
  provision(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential>;
  rotate(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential>;
  revoke(request: Pick<MqttCredentialRequest, 'mqttServerId' | 'identity' | 'username' | 'vhost'>): Promise<void>;
}

export const MQTT_CREDENTIAL_PROVISIONING_HOST_PROVIDER = Symbol.for('attraccess.plugin.mqttCredentialProvisioningHostProvider');

/** Host seam through which integrations discover and use broker providers. */
export interface MqttCredentialProvisioningHostProvider {
  availableProviders(mqttServerId: number): Promise<readonly { providerId: string; displayName: string }[]>;
  provision(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential | ManualMqttCredentialInstructions>;
  rotate(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential | ManualMqttCredentialInstructions>;
  revoke(request: Pick<MqttCredentialRequest, 'mqttServerId' | 'identity' | 'username' | 'vhost'>): Promise<void | ManualMqttCredentialInstructions>;
}

export interface ManualMqttCredentialInstructions {
  readonly mqttServerId: number;
  readonly username: string;
  readonly vhost: string;
  readonly publishTopics: readonly string[];
  readonly subscribeTopics: readonly string[];
  readonly instructions: readonly string[];
}

/** Factory keeps provider dependencies private to the plugin that owns them. */
export type MqttCredentialProvisioningProviderFactory = (
  context: PluginContext
) => MqttCredentialProvisioningProvider;
