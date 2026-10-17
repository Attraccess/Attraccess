import { MqttServer } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MqttPersistence, NewMqttServer } from './port';

@Injectable()
export class TypeormMqttPersistence extends MqttPersistence {
  constructor(@InjectRepository(MqttServer) private readonly servers: Repository<MqttServer>) {
    super();
  }

  async listServers(): Promise<MqttServer[]> {
    return (await this.servers.find()).map((row) => ({ ...row }));
  }
  async readServer(id: number): Promise<MqttServer | null> {
    const row = await this.servers.findOneBy({ id });
    return row ? { ...row } : null;
  }
  async createServer(input: NewMqttServer): Promise<MqttServer> {
    return { ...(await this.servers.save(this.servers.create(input))) };
  }
  async saveServer(server: MqttServer): Promise<MqttServer> {
    return { ...(await this.servers.save(server)) };
  }
  async removeServer(server: MqttServer): Promise<void> {
    await this.servers.remove(server);
  }
  async setEncryptedPassword(id: number, encrypted: string): Promise<void> {
    await this.servers.update(id, { password: encrypted });
  }
}
