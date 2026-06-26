import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanionDevice, ResourceFlowNode } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompanionEventType, CompanionIdleDto, CompanionSocket } from './companion.types';
import { CompanionService } from './companion.service';

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
    private readonly eventEmitter: EventEmitter2,
    @Inject(CompanionService)
    private readonly companionService: CompanionService,
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

  public async sendLockCommand(deviceId: number): Promise<boolean> {
    // persist first so a restarted/offline device re-locks on next authenticate
    await this.deviceRepository.update(deviceId, { locked: true });
    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_LOCK_PC);
  }

  public async sendUnlockCommand(deviceId: number): Promise<boolean> {
    await this.deviceRepository.update(deviceId, { locked: false });
    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_UNLOCK_PC);
  }

  public sendDeviceRenamed(deviceId: number, deviceName: string): void {
    this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_DEVICE_RENAMED, { deviceName });
  }

  public sendUpdateAvailable(deviceId: number): boolean {
    const socket = [...this.sockets.values()].find((s) => s.deviceId === deviceId);
    if (!socket) return false;

    const manifest = this.companionService.getManifest();
    if (!manifest) return false;

    const platform = socket.platform ?? undefined;
    const entry = platform ? manifest.platforms.find((p) => p.platform === platform) : undefined;
    const downloadUrl = entry
      ? `/api/companion/download/${entry.platform}/${entry.arch}`
      : `/api/companion/download/${platform ?? 'linux'}/x64`;

    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_UPDATE_AVAILABLE, {
      version: manifest.version,
      downloadUrl,
    });
  }

  public handleIdleEvent(deviceId: number, payload: CompanionIdleDto): void {
    this.eventEmitter.emit('companion.idle', { deviceId, payload });
  }

  public handleActiveEvent(deviceId: number, payload: CompanionIdleDto): void {
    this.eventEmitter.emit('companion.active', { deviceId, payload });
  }

  private sendCommandToDevice(deviceId: number, type: CompanionEventType, payload: unknown = {}): boolean {
    const socket = [...this.sockets.values()].find((s) => s.deviceId === deviceId);
    if (!socket) {
      this.logger.warn(`Device ${deviceId} not connected, cannot send ${type}`);
      return false;
    }
    try {
      socket.sendEvent(type, payload);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send ${type} to device ${deviceId}: ${(error as Error).message}`);
      return false;
    }
  }
}
