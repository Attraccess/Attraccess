import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { RabbitmqPermissions } from './rabbitmq-credential-provisioning.contracts';
import { RabbitmqTopicPermissions } from './rabbitmq-credential-provisioning.contracts';
import type { MqttCredentialRequest } from '@attraccess/plugins-backend-sdk';
import type { ProvisionedMqttCredential } from '@attraccess/plugins-backend-sdk';

export abstract class RabbitmqCredentialProvisioningProviderSupportsContract {
  abstract supports(config: MqttServerConnectionConfig): Promise<boolean>;
  abstract provision(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential>;
  abstract rotate(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential>;
  abstract revoke(
    request: Pick<MqttCredentialRequest, 'mqttServerId' | 'identity' | 'username' | 'vhost'>,
  ): Promise<void>;
  protected abstract writeCredential(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential>;
  protected abstract writeCredentialLocked(
    request: MqttCredentialRequest,
    config: MqttServerConnectionConfig,
  ): Promise<ProvisionedMqttCredential>;
  protected abstract writePermissions(
    config: MqttServerConnectionConfig,
    request: MqttCredentialRequest,
    vhost: string,
    username: string,
  ): Promise<void>;
  protected abstract userExists(config: MqttServerConnectionConfig, username: string): Promise<boolean>;
  protected abstract exists(config: MqttServerConnectionConfig, path: string): Promise<boolean>;
  protected abstract getPermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
  ): Promise<RabbitmqPermissions | null>;
  protected abstract getTopicPermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
  ): Promise<RabbitmqTopicPermissions | null>;
  protected abstract getOptional<T>(config: MqttServerConnectionConfig, path: string): Promise<T | null>;
  protected abstract restorePermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
    permissions: RabbitmqPermissions | null,
    topicPermissions: RabbitmqTopicPermissions | null,
  ): Promise<void>;
  protected abstract restorePermission<T>(
    config: MqttServerConnectionConfig,
    path: string,
    permissions: T | null,
  ): Promise<void>;
  protected abstract failAfterRollback(error: unknown, rollback: Array<() => Promise<unknown>>): Promise<never>;
  protected abstract requireConfig(mqttServerId: number): Promise<MqttServerConnectionConfig>;
  protected abstract assertRequest(request: MqttCredentialRequest): void;
  protected abstract assertTopicFilter(filter: string): void;
  protected abstract assertName(value: string, label: string): void;
  protected abstract assertNotManagementUser(config: MqttServerConnectionConfig, username: string): void;
}
