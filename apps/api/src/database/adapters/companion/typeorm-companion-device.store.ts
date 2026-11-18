import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import type { CompanionControlledResource, CompanionDeviceRecord } from '@attraccess/application-models';
import { Repository } from 'typeorm';
import type { CompanionDeviceStore } from '../../../companion/companion-device.port';

const COMPANION_NODE_TYPES = ['output.companion.lock-pc', 'output.companion.unlock-pc'];

function toRecord(entity: CompanionDevice): CompanionDeviceRecord {
  return {
    id: entity.id,
    name: entity.name,
    tokenHash: entity.tokenHash,
    resources: (entity.resources ?? []).map((resource) => ({ ...resource })),
    locked: entity.locked,
    lastConnection: entity.lastConnection,
    firstConnection: entity.firstConnection,
    appVersion: entity.appVersion,
  };
}

function nodeTargetsDevice(node: ResourceFlowNode, deviceId: number): boolean {
  try {
    const data = typeof node.data === 'string' ? JSON.parse(node.data as unknown as string) : node.data;
    return data?.deviceId === deviceId;
  } catch {
    return false;
  }
}

@Injectable()
export class TypeOrmCompanionDeviceStore implements CompanionDeviceStore {
  constructor(
    @InjectRepository(CompanionDevice) private readonly devices: Repository<CompanionDevice>,
    @InjectRepository(ResourceFlowNode) private readonly flowNodes: Repository<ResourceFlowNode>,
  ) {}

  async registerDevice(input: { name: string; tokenHash: string }): Promise<CompanionDeviceRecord> {
    const device = this.devices.create({ name: input.name, tokenHash: input.tokenHash });
    await this.devices.save(device);
    return toRecord(device);
  }

  async findDevice(id: number): Promise<CompanionDeviceRecord | null> {
    const device = await this.devices.findOne({ where: { id }, relations: { resources: true } });
    return device ? toRecord(device) : null;
  }

  async listDevices(): Promise<CompanionDeviceRecord[]> {
    return (await this.devices.find({ relations: { resources: true } })).map(toRecord);
  }

  async recordConnection(id: number, appVersion?: string): Promise<void> {
    await this.devices.update(id, { lastConnection: new Date(), ...(appVersion !== undefined && { appVersion }) });
  }

  async setLocked(id: number, locked: boolean): Promise<void> {
    await this.devices.update(id, { locked });
  }

  async renameDevice(id: number, name: string): Promise<CompanionDeviceRecord> {
    await this.devices.update(id, { name });
    return toRecord(await this.devices.findOneOrFail({ where: { id } }));
  }

  async deleteDevice(id: number): Promise<void> {
    await this.devices.delete(id);
  }

  async findResourcesControlledBy(deviceId: number): Promise<CompanionControlledResource[]> {
    const nodes = await this.flowNodes
      .createQueryBuilder('node')
      .innerJoinAndSelect('node.resource', 'resource')
      .where('node.type IN (:...types)', { types: COMPANION_NODE_TYPES })
      .getMany();

    const seen = new Set<number>();
    const resources: CompanionControlledResource[] = [];
    for (const node of nodes.filter((candidate) => nodeTargetsDevice(candidate, deviceId))) {
      if (node.resource && !seen.has(node.resource.id)) {
        seen.add(node.resource.id);
        resources.push({ id: node.resource.id, name: node.resource.name });
      }
    }
    return resources;
  }
}
