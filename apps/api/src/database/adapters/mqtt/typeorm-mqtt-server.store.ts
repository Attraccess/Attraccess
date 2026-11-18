import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MqttServer } from '@attraccess/database-entities';
import type { MqttServerChanges, MqttServerRecord, NewMqttServer } from '@attraccess/application-models';
import { In, Repository } from 'typeorm';
import type { MqttServerStore } from '../../../mqtt/mqtt-server-store.port';

function toRecord(entity: MqttServer): MqttServerRecord {
  return {
    id: entity.id,
    name: entity.name,
    host: entity.host,
    port: entity.port,
    managementPort: entity.managementPort ?? null,
    username: entity.username ?? null,
    password: entity.password ?? null,
    clientId: entity.clientId ?? null,
    useTls: entity.useTls,
    caCert: entity.caCert ?? null,
    tlsInsecure: entity.tlsInsecure,
    tlsServername: entity.tlsServername ?? null,
    defaultPublishQos: entity.defaultPublishQos,
    defaultPublishRetain: entity.defaultPublishRetain,
    defaultSubscribeQos: entity.defaultSubscribeQos,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class TypeOrmMqttServerStore implements MqttServerStore {
  constructor(@InjectRepository(MqttServer) private readonly servers: Repository<MqttServer>) {}

  async listServers(): Promise<MqttServerRecord[]> {
    return (await this.servers.find()).map(toRecord);
  }

  async findServer(id: number): Promise<MqttServerRecord | null> {
    const server = await this.servers.findOneBy({ id });
    return server ? toRecord(server) : null;
  }

  async findExistingServerIds(ids: readonly number[]): Promise<Set<number>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Set();
    const found = await this.servers.find({ where: { id: In(unique) }, select: { id: true } });
    return new Set(found.map((server) => server.id));
  }

  async createServer(input: NewMqttServer): Promise<MqttServerRecord> {
    const created = this.servers.create({ ...input });
    return toRecord(await this.servers.save(created));
  }

  async updateServer(id: number, changes: MqttServerChanges): Promise<MqttServerRecord | null> {
    const server = await this.servers.findOneBy({ id });
    if (!server) return null;
    // Fields that are not part of the change stay as stored.
    Object.assign(server, Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)));
    return toRecord(await this.servers.save(server));
  }

  async deleteServer(id: number): Promise<void> {
    await this.servers.delete({ id });
  }

  async storeEncryptedPassword(id: number, encryptedPassword: string): Promise<void> {
    await this.servers.update(id, { password: encryptedPassword });
  }
}
