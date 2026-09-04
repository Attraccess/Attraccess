// RabbitMQ user management — plugin-side business logic (ATT-522).
//
// Translates the plugin's user-management surface into RabbitMQ management API
// calls. As with detection, all RabbitMQ knowledge lives here in the plugin:
// the core only hands us a generic MqttServerConnectionConfig through the
// sanctioned ACCESS_MQTT_SERVERS hook, and the management API is reached with
// the MQTT server's own credentials.
import type { MqttServerConnectionConfig, PluginContext } from '@attraccess/plugins-backend-sdk';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { RabbitmqManagementClient } from './rabbitmq-management-client';
import type {
  RabbitmqPermission,
  RabbitmqUser,
  RabbitmqUserList,
  SetRabbitmqPermissionDto,
  UpsertRabbitmqUserDto,
} from './rabbitmq-users.types';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');

// Raw shapes returned by the RabbitMQ management API. Only the fields we read.
interface RawUser {
  name: string;
  // Array on RabbitMQ >= 3.9, comma-separated string on older brokers.
  tags?: string[] | string;
  password_hash?: string;
  hashing_algorithm?: string;
}

interface RawPermission {
  user: string;
  vhost: string;
  configure: string;
  write: string;
  read: string;
}

interface RawVhost {
  name: string;
}

// Body of PUT /api/users/:name. RabbitMQ replaces the whole user record, so an
// update that should keep the password re-sends the stored hash.
interface PutUserBody {
  tags: string;
  password?: string;
  password_hash?: string;
  hashing_algorithm?: string;
}

@Injectable()
export class RabbitmqUsersService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(RabbitmqManagementClient) private readonly client: RabbitmqManagementClient,
  ) {}

  // Lists all users with their per-vhost permissions, plus the vhost list for
  // the UI's vhost choices. Three management calls, joined here.
  async listUsers(mqttServerId: number): Promise<RabbitmqUserList> {
    const config = await this.requireConfig(mqttServerId);

    const [rawUsers, rawPermissions, rawVhosts] = await Promise.all([
      this.client.request<RawUser[]>(config, 'GET', '/users'),
      this.client.request<RawPermission[]>(config, 'GET', '/permissions'),
      this.client.request<RawVhost[]>(config, 'GET', '/vhosts'),
    ]);

    const permissionsByUser = new Map<string, RabbitmqPermission[]>();
    for (const permission of rawPermissions ?? []) {
      const list = permissionsByUser.get(permission.user) ?? [];
      list.push({
        vhost: permission.vhost,
        configure: permission.configure,
        write: permission.write,
        read: permission.read,
      });
      permissionsByUser.set(permission.user, list);
    }

    const users: RabbitmqUser[] = (rawUsers ?? []).map((user) => ({
      name: user.name,
      tags: this.normalizeTags(user.tags),
      permissions: permissionsByUser.get(user.name) ?? [],
    }));
    users.sort((a, b) => a.name.localeCompare(b.name));

    return {
      mqttServerId,
      users,
      vhosts: (rawVhosts ?? []).map((vhost) => vhost.name).sort((a, b) => a.localeCompare(b)),
    };
  }

  // Creates or updates one user, optionally applying per-vhost permissions in
  // the same operation (used by the create form's "default MQTT permissions").
  async upsertUser(mqttServerId: number, username: string, dto: UpsertRabbitmqUserDto): Promise<void> {
    this.assertValidName(username, 'Username');
    const config = await this.requireConfig(mqttServerId);

    const existing = await this.findUser(config, username);
    const password = dto.password?.length ? dto.password : undefined;

    if (!existing && !password) {
      throw new HttpException('Password is required when creating a new user.', HttpStatus.BAD_REQUEST);
    }

    const body: PutUserBody = { tags: (dto.tags ?? this.normalizeTags(existing?.tags)).join(',') };
    if (password) {
      body.password = password;
    } else if (existing?.password_hash) {
      // PUT replaces the record — re-send the stored hash to keep the password.
      body.password_hash = existing.password_hash;
      if (existing.hashing_algorithm) {
        body.hashing_algorithm = existing.hashing_algorithm;
      }
    }

    await this.client.request(config, 'PUT', `/users/${encodeURIComponent(username)}`, body);

    for (const permission of dto.permissions ?? []) {
      await this.putPermission(config, username, permission);
    }
  }

  async deleteUser(mqttServerId: number, username: string): Promise<void> {
    this.assertValidName(username, 'Username');
    const config = await this.requireConfig(mqttServerId);

    if (config.username !== null && config.username === username) {
      // Deleting the account the management calls run as would lock the plugin
      // (and the broker connection) out.
      throw new HttpException(
        'Refusing to delete the user the MQTT server connection is configured with.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // RabbitMQ drops the user's permissions together with the user.
    await this.client.request(config, 'DELETE', `/users/${encodeURIComponent(username)}`);
  }

  async setPermissions(mqttServerId: number, username: string, dto: SetRabbitmqPermissionDto): Promise<void> {
    this.assertValidName(username, 'Username');
    this.assertValidName(dto.vhost, 'Vhost');
    const config = await this.requireConfig(mqttServerId);
    await this.putPermission(config, username, dto);
  }

  async clearPermissions(mqttServerId: number, username: string, vhost: string): Promise<void> {
    this.assertValidName(username, 'Username');
    this.assertValidName(vhost, 'Vhost');
    const config = await this.requireConfig(mqttServerId);
    await this.client.request(
      config,
      'DELETE',
      `/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(username)}`,
    );
  }

  private async putPermission(
    config: MqttServerConnectionConfig,
    username: string,
    permission: RabbitmqPermission | SetRabbitmqPermissionDto,
  ): Promise<void> {
    await this.client.request(
      config,
      'PUT',
      `/permissions/${encodeURIComponent(permission.vhost)}/${encodeURIComponent(username)}`,
      {
        configure: permission.configure ?? '',
        write: permission.write ?? '',
        read: permission.read ?? '',
      },
    );
  }

  // Reads one user; null when the broker doesn't know the name.
  private async findUser(config: MqttServerConnectionConfig, username: string): Promise<RawUser | null> {
    try {
      return await this.client.request<RawUser>(config, 'GET', `/users/${encodeURIComponent(username)}`);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  private async requireConfig(mqttServerId: number): Promise<MqttServerConnectionConfig> {
    // ACCESS_MQTT_SERVERS gates this call; the core resolves + decrypts the
    // credentials and hands us a broker-agnostic config.
    const config = await this.context.getMqttServerConfig(mqttServerId);
    if (!config) {
      throw new HttpException('MQTT server not found.', HttpStatus.NOT_FOUND);
    }
    return config;
  }

  private normalizeTags(tags: RawUser['tags']): string[] {
    if (Array.isArray(tags)) {
      return tags.filter((tag) => tag.length > 0);
    }
    if (typeof tags === 'string' && tags.length > 0) {
      return tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    return [];
  }

  private assertValidName(value: string, label: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new HttpException(`${label} must not be empty.`, HttpStatus.BAD_REQUEST);
    }
    if (value.length > 255) {
      throw new HttpException(`${label} must be at most 255 characters.`, HttpStatus.BAD_REQUEST);
    }
  }
}
