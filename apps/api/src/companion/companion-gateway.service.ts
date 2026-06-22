import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { CompanionEventType, CompanionSocket } from './companion.types';

@Injectable()
export class CompanionGatewayService {
  private readonly logger = new Logger(CompanionGatewayService.name);

  // ponytail: simple map, one socket per device (last-wins on reconnect)
  readonly sockets = new Map<string, CompanionSocket>();

  public constructor(
    @InjectRepository(CompanionDevice)
    private readonly deviceRepository: Repository<CompanionDevice>,
    @InjectRepository(ResourceFlowNode)
    private readonly flowNodeRepository: Repository<ResourceFlowNode>,
  ) {}

  public getConnectedDevices(): CompanionDevice[] {
    const deviceIds = [...new Set([...this.sockets.values()].map((s) => s.deviceId).filter((id): id is number => id !== null))];
    return deviceIds.map((id) => ({ id }) as CompanionDevice);
  }

  public async getResourcesForDevice(deviceId: number): Promise<Array<{ id: number; name: string }>> {
    const nodes = await this.flowNodeRepository
      .createQueryBuilder('node')
      .innerJoinAndSelect('node.resource', 'resource')
      .where('node.type IN (:...types)', {
        types: ['output.companion.lock-pc', 'output.companion.unlock-pc'],
      })
      .getMany();

    const matchingNodes = nodes.filter((node) => {
      try {
        const data = typeof node.data === 'string' ? JSON.parse(node.data as unknown as string) : node.data;
        return data?.deviceId === deviceId;
      } catch {
        return false;
      }
    });

    const seen = new Set<number>();
    const resources: Array<{ id: number; name: string }> = [];
    for (const node of matchingNodes) {
      if (node.resource && !seen.has(node.resource.id)) {
        seen.add(node.resource.id);
        resources.push({ id: node.resource.id, name: node.resource.name });
      }
    }
    return resources;
  }

  public sendLockCommand(deviceId: number): boolean {
    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_LOCK_PC);
  }

  public sendUnlockCommand(deviceId: number): boolean {
    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_UNLOCK_PC);
  }

  private sendCommandToDevice(deviceId: number, type: CompanionEventType): boolean {
    const socket = [...this.sockets.values()].find((s) => s.deviceId === deviceId);
    if (!socket) {
      this.logger.warn(`Device ${deviceId} not connected, cannot send ${type}`);
      return false;
    }
    try {
      socket.sendEvent(type, {});
      return true;
    } catch (error) {
      this.logger.error(`Failed to send ${type} to device ${deviceId}: ${(error as Error).message}`);
      return false;
    }
  }
}
