import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import { CompanionPersistence } from './port';

@Injectable()
export class TypeormCompanionPersistence extends CompanionPersistence {
  constructor(
    @InjectRepository(CompanionDevice) private readonly devices: Repository<CompanionDevice>,
    @InjectRepository(ResourceFlowNode) private readonly nodes: Repository<ResourceFlowNode>,
  ) {
    super();
  }
  async register(name: string, tokenHash: string): Promise<CompanionDevice> {
    const device = this.devices.create({ name, tokenHash });
    await this.devices.save(device);
    return toApplicationRecord(device);
  }
  async findById(id: number): Promise<CompanionDevice | null> {
    return toApplicationRecord(await this.devices.findOne({ where: { id }, relations: ['resources'] }));
  }
  async touchConnection(id: number, at: Date, appVersion?: string): Promise<void> {
    await this.devices.update(id, { lastConnection: at, ...(appVersion !== undefined && { appVersion }) });
  }
  async listDevices(): Promise<CompanionDevice[]> {
    return toApplicationRecord(await this.devices.find({ relations: ['resources'] }));
  }
  async rename(id: number, name: string): Promise<CompanionDevice> {
    await this.devices.update(id, { name });
    return toApplicationRecord(await this.devices.findOneOrFail({ where: { id } }));
  }
  async remove(id: number): Promise<void> {
    await this.devices.delete(id);
  }
  async setLocked(id: number, locked: boolean): Promise<void> {
    await this.devices.update(id, { locked });
  }
  async lockCommandNodes(): Promise<ResourceFlowNode[]> {
    return toApplicationRecord(
      await this.nodes
        .createQueryBuilder('node')
        .innerJoinAndSelect('node.resource', 'resource')
        .where('node.type IN (:...types)', { types: ['output.companion.lock-pc', 'output.companion.unlock-pc'] })
        .getMany(),
    );
  }
}
