import { randomBytes } from 'crypto';
import type {
  MqttCredentialProvisioningProvider,
  MqttCredentialRequest,
  MqttServerConnectionConfig,
  PluginContext,
  ProvisionedMqttCredential,
} from '@attraccess/plugins-backend-sdk';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { RabbitmqDetectionService } from './rabbitmq-detection.service';
import { RabbitmqManagementClient } from './rabbitmq-management-client';

interface RabbitmqPermissions {
  configure: string;
  write: string;
  read: string;
}

interface RabbitmqTopicPermissions {
  exchange: string;
  write: string;
  read: string;
}

interface VhostLock {
  mutex: Mutex;
  users: number;
}

/**
 * Translates the generic per-device MQTT policy to RabbitMQ's vhost and topic
 * permissions. Passwords are created in memory and never logged or retained.
 */
export class RabbitmqCredentialProvisioningProvider implements MqttCredentialProvisioningProvider {
  private static readonly vhostLocks = new Map<string, VhostLock>();

  readonly id = 'rabbitmq';
  readonly displayName = 'RabbitMQ Management API';

  private readonly client = new RabbitmqManagementClient();
  private readonly detection: RabbitmqDetectionService;

  constructor(private readonly context: PluginContext) {
    this.detection = new RabbitmqDetectionService(context);
  }

  async supports(config: MqttServerConnectionConfig): Promise<boolean> {
    return (await this.detection.detect(config.id)).isRabbitMQ;
  }

  provision(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential> {
    return this.writeCredential(request);
  }

  rotate(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential> {
    return this.writeCredential(request);
  }

  async revoke(
    request: Pick<MqttCredentialRequest, 'mqttServerId' | 'identity' | 'username' | 'vhost'>,
  ): Promise<void> {
    this.assertName(request.username, 'Username');
    const config = await this.requireConfig(request.mqttServerId);
    this.assertNotManagementUser(config, request.username);
    try {
      await this.client.request(config, 'DELETE', `/users/${encodeURIComponent(request.username)}`);
    } catch (error) {
      // A prior attempt may have removed the credential before its database state was recorded.
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) return;
      throw error;
    }
  }

  private async writeCredential(request: MqttCredentialRequest): Promise<ProvisionedMqttCredential> {
    this.assertRequest(request);
    const config = await this.requireConfig(request.mqttServerId);
    this.assertNotManagementUser(config, request.username);
    const lockKey = `${config.id}:${request.vhost}`;
    let lock = RabbitmqCredentialProvisioningProvider.vhostLocks.get(lockKey);
    if (!lock) {
      lock = { mutex: new Mutex(), users: 0 };
      RabbitmqCredentialProvisioningProvider.vhostLocks.set(lockKey, lock);
    }
    lock.users += 1;

    try {
      return await lock.mutex.runExclusive(() => this.writeCredentialLocked(request, config));
    } finally {
      lock.users -= 1;
      if (lock.users === 0 && RabbitmqCredentialProvisioningProvider.vhostLocks.get(lockKey) === lock) {
        RabbitmqCredentialProvisioningProvider.vhostLocks.delete(lockKey);
      }
    }
  }

  private async writeCredentialLocked(
    request: MqttCredentialRequest,
    config: MqttServerConnectionConfig,
  ): Promise<ProvisionedMqttCredential> {
    const password = randomBytes(24).toString('base64url');
    const vhost = encodeURIComponent(request.vhost);
    const username = encodeURIComponent(request.username);
    const existing = await this.userExists(config, username);
    const vhostExisted = await this.exists(config, `/vhosts/${vhost}`);
    await this.client.request(config, 'PUT', `/vhosts/${vhost}`);

    let previousPermissions: RabbitmqPermissions | null = null;
    let previousTopicPermissions: RabbitmqTopicPermissions | null = null;
    let permissionsCaptured = false;
    try {
      if (existing) {
        previousPermissions = await this.getPermissions(config, vhost, username);
        previousTopicPermissions = await this.getTopicPermissions(config, vhost, username);
        permissionsCaptured = true;
        await this.writePermissions(config, request, vhost, username);
        await this.client.request(config, 'PUT', `/users/${username}`, { password, tags: '' });
      } else {
        await this.client.request(config, 'PUT', `/users/${username}`, { password, tags: '' });
        await this.writePermissions(config, request, vhost, username);
      }
    } catch (error) {
      const rollback = [
        ...(existing && permissionsCaptured
          ? [() => this.restorePermissions(config, vhost, username, previousPermissions, previousTopicPermissions)]
          : !existing
            ? [() => this.client.request(config, 'DELETE', `/users/${username}`)]
            : []),
        ...(!vhostExisted ? [() => this.client.request(config, 'DELETE', `/vhosts/${vhost}`)] : []),
      ];
      await this.failAfterRollback(error, rollback);
    }

    return {
      providerId: this.id,
      identity: request.identity,
      username: request.username,
      vhost: request.vhost,
      password,
    };
  }

  private async writePermissions(
    config: MqttServerConnectionConfig,
    request: MqttCredentialRequest,
    vhost: string,
    username: string,
  ): Promise<void> {
    const subscriptionQueue = `mqtt-subscription-${escapeRegex(request.identity)}.*`;
    await this.client.request(config, 'PUT', `/permissions/${vhost}/${username}`, {
      configure: `^${subscriptionQueue}$`,
      write: `^(amq\\.topic|${subscriptionQueue})$`,
      read: `^(amq\\.topic|${subscriptionQueue})$`,
    });
    await this.client.request(config, 'PUT', `/topic-permissions/${vhost}/${username}`, {
      exchange: 'amq.topic',
      write: mqttFiltersToRegex(request.topicPolicy.publish),
      read: mqttFiltersToRegex(request.topicPolicy.subscribe),
    });
  }

  private async userExists(config: MqttServerConnectionConfig, username: string): Promise<boolean> {
    return this.exists(config, `/users/${username}`);
  }

  private async exists(config: MqttServerConnectionConfig, path: string): Promise<boolean> {
    try {
      await this.client.request(config, 'GET', path);
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        return false;
      }
      throw error;
    }
  }

  private async getPermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
  ): Promise<RabbitmqPermissions | null> {
    return this.getOptional(config, `/permissions/${vhost}/${username}`);
  }

  private async getTopicPermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
  ): Promise<RabbitmqTopicPermissions | null> {
    return this.getOptional(config, `/topic-permissions/${vhost}/${username}`);
  }

  private async getOptional<T>(config: MqttServerConnectionConfig, path: string): Promise<T | null> {
    try {
      return await this.client.request<T>(config, 'GET', path);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  private async restorePermissions(
    config: MqttServerConnectionConfig,
    vhost: string,
    username: string,
    permissions: RabbitmqPermissions | null,
    topicPermissions: RabbitmqTopicPermissions | null,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.restorePermission(config, `/permissions/${vhost}/${username}`, permissions),
      this.restorePermission(config, `/topic-permissions/${vhost}/${username}`, topicPermissions),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Failed to restore RabbitMQ permissions.');
    }
  }

  private async restorePermission<T>(
    config: MqttServerConnectionConfig,
    path: string,
    permissions: T | null,
  ): Promise<void> {
    await this.client.request(config, permissions ? 'PUT' : 'DELETE', path, permissions ?? undefined);
  }

  private async failAfterRollback(error: unknown, rollback: Array<() => Promise<unknown>>): Promise<never> {
    const results = await Promise.allSettled(rollback.map((operation) => operation()));
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError([error, ...failures], 'Credential provisioning failed and rollback was incomplete.');
    }
    throw error;
  }

  private async requireConfig(mqttServerId: number): Promise<MqttServerConnectionConfig> {
    const config = await this.context.getMqttServerConfig(mqttServerId);
    if (!config) {
      throw new BadRequestException('MQTT server not found.');
    }
    return config;
  }

  private assertRequest(request: MqttCredentialRequest): void {
    this.assertName(request.identity, 'Identity');
    this.assertName(request.username, 'Username');
    this.assertName(request.vhost, 'Vhost');
    if (!Array.isArray(request.topicPolicy.publish) || !Array.isArray(request.topicPolicy.subscribe)) {
      throw new BadRequestException('Publish and subscribe topic policies must be arrays.');
    }
    for (const filter of [...request.topicPolicy.publish, ...request.topicPolicy.subscribe]) {
      if (typeof filter !== 'string' || filter.length === 0 || filter.length > 1024) {
        throw new BadRequestException('MQTT topic filters must be non-empty strings no longer than 1024 characters.');
      }
      this.assertTopicFilter(filter);
    }
  }

  private assertTopicFilter(filter: string): void {
    // rabbitmq_mqtt maps both MQTT separators and literal dots to AMQP dots,
    // so dot-bearing levels cannot be authorized without widening access.
    if (filter.includes('.')) {
      throw new BadRequestException('RabbitMQ MQTT topic policies cannot contain dots.');
    }
    const segments = filter.split('/');
    for (const [index, segment] of segments.entries()) {
      if (
        (segment.includes('+') && segment !== '+') ||
        (segment.includes('#') && (segment !== '#' || index !== segments.length - 1))
      ) {
        throw new BadRequestException(
          'MQTT wildcards must occupy a complete topic level, and # must be the final level.',
        );
      }
    }
  }

  private assertName(value: string, label: string): void {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 255) {
      throw new BadRequestException(`${label} must be a non-empty string no longer than 255 characters.`);
    }
  }

  private assertNotManagementUser(config: MqttServerConnectionConfig, username: string): void {
    if (config.username === username) {
      throw new BadRequestException('Refusing to modify the MQTT server management identity.');
    }
  }
}

// RabbitMQ topic permissions evaluate AMQP routing keys, where rabbitmq_mqtt
// maps MQTT's / topic levels to dots. Escape literal segments and translate
// MQTT's + and # wildcards without widening a level boundary.
export function mqttFiltersToRegex(filters: readonly string[]): string {
  if (filters.length === 0) {
    return '$(?!)';
  }
  return `^(?:${filters.map(mqttFilterToRegex).join('|')})$`;
}

function mqttFilterToRegex(filter: string): string {
  const terminalMultiLevel = filter.endsWith('/#');
  const prefix = terminalMultiLevel ? filter.slice(0, -2) : filter;
  const translated = prefix
    .split('/')
    .map((segment) => {
      if (segment === '+') {
        // Dot-bearing MQTT levels are rejected above because RabbitMQ cannot
        // distinguish them from additional slash-separated levels here.
        return '[^.]+';
      }
      if (segment === '#') {
        return '.*';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('\\.');
  return terminalMultiLevel ? `${translated}(?:\\..*)?` : translated;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
