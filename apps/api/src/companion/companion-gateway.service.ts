import { Injectable, Logger } from '@nestjs/common';
import type { CompanionDevice } from '@attraccess/application-models';
import { CompanionPersistence } from './persistence/port';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CompanionEventType,
  CompanionForegroundAppDto,
  CompanionIdleDto,
  CompanionUsbDeviceDto,
  CompanionSocket,
} from './companion.types';

@Injectable()
export class CompanionGatewayService {
  private readonly logger = new Logger(CompanionGatewayService.name);

  // ponytail: simple map, one socket per device (last-wins on reconnect)
  readonly sockets = new Map<string, CompanionSocket>();

  public constructor(
    private readonly persistence: CompanionPersistence,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public getConnectedDevices(): CompanionDevice[] {
    const deviceIds = [
      ...new Set([...this.sockets.values()].map((s) => s.deviceId).filter((id): id is number => id !== null)),
    ];
    return deviceIds.map((id) => ({ id }) as CompanionDevice);
  }

  public async getResourcesForDevice(deviceId: number): Promise<Array<{ id: number; name: string }>> {
    const nodes = await this.persistence.lockCommandNodes();

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
    await this.persistence.setLocked(deviceId, true);
    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_LOCK_PC);
  }

  public async sendUnlockCommand(deviceId: number): Promise<boolean> {
    await this.persistence.setLocked(deviceId, false);
    return this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_UNLOCK_PC);
  }

  public sendDeviceRenamed(deviceId: number, deviceName: string): void {
    this.sendCommandToDevice(deviceId, CompanionEventType.COMPANION_DEVICE_RENAMED, { deviceName });
  }

  public handleIdleEvent(deviceId: number, payload: CompanionIdleDto): void {
    this.eventEmitter.emit('companion.idle', { deviceId, payload });
  }

  public handleActiveEvent(deviceId: number, payload: CompanionIdleDto): void {
    this.eventEmitter.emit('companion.active', { deviceId, payload });
  }

  public handleForegroundAppEvent(deviceId: number, payload: CompanionForegroundAppDto): void {
    this.eventEmitter.emit('companion.foreground_app', { deviceId, payload });
  }

  public handleUsbConnectedEvent(deviceId: number, payload: CompanionUsbDeviceDto): void {
    this.eventEmitter.emit('companion.usb_connected', { deviceId, payload });
  }

  public handleUsbDisconnectedEvent(deviceId: number, payload: CompanionUsbDeviceDto): void {
    this.eventEmitter.emit('companion.usb_disconnected', { deviceId, payload });
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
