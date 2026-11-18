import type { MqttServerChanges, MqttServerRecord, NewMqttServer } from '@attraccess/application-models';
import type { MqttServerStore } from './mqtt-server-store.port';

function definedFields<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

/** In-memory MqttServerStore for unit tests. */
export class FakeMqttServerStore implements MqttServerStore {
  readonly servers = new Map<number, MqttServerRecord>();
  private nextId = 1;

  async listServers(): Promise<MqttServerRecord[]> {
    return [...this.servers.values()].map((server) => ({ ...server }));
  }

  async findServer(id: number): Promise<MqttServerRecord | null> {
    const server = this.servers.get(id);
    return server ? { ...server } : null;
  }

  async findExistingServerIds(ids: readonly number[]): Promise<Set<number>> {
    return new Set(ids.filter((id) => this.servers.has(id)));
  }

  async createServer(input: NewMqttServer): Promise<MqttServerRecord> {
    const now = new Date();
    const server = {
      managementPort: null,
      username: null,
      password: null,
      clientId: null,
      useTls: false,
      caCert: null,
      tlsInsecure: false,
      tlsServername: null,
      defaultPublishQos: 0,
      defaultPublishRetain: false,
      defaultSubscribeQos: 0,
      ...definedFields(input),
      id: this.nextId++,
      createdAt: now,
      updatedAt: now,
    } as MqttServerRecord;
    this.servers.set(server.id, server);
    return { ...server };
  }

  async updateServer(id: number, changes: MqttServerChanges): Promise<MqttServerRecord | null> {
    const server = this.servers.get(id);
    if (!server) return null;
    Object.assign(server, definedFields(changes), { updatedAt: new Date() });
    return { ...server };
  }

  async deleteServer(id: number): Promise<void> {
    this.servers.delete(id);
  }

  async storeEncryptedPassword(id: number, encryptedPassword: string): Promise<void> {
    const server = this.servers.get(id);
    if (server) server.password = encryptedPassword;
  }
}
