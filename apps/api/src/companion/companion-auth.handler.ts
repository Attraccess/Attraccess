import { Inject, Injectable, Logger } from '@nestjs/common';
import { CompanionService } from './companion.service';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionAuthenticatePayload, CompanionEventType, CompanionSocket } from './companion.types';

@Injectable()
export class CompanionAuthHandler {
  private readonly logger = new Logger(CompanionAuthHandler.name);

  @Inject(CompanionService)
  private readonly service: CompanionService;

  @Inject(CompanionGatewayService)
  private readonly gatewayService: CompanionGatewayService;

  public async handleAuthenticate(socket: CompanionSocket, payload: CompanionAuthenticatePayload): Promise<void> {
    if (!payload.id || !payload.token) {
      await this.registerNewDevice(socket);
    } else {
      await this.authenticateExistingDevice(socket, payload);
    }
  }

  private async registerNewDevice(socket: CompanionSocket): Promise<void> {
    this.logger.debug('Registering new companion device');
    const { device, token } = await this.service.createDevice();

    socket.deviceId = device.id;
    socket.sendEvent(CompanionEventType.COMPANION_REGISTER, { id: device.id, token });
    this.logger.log(`New companion device registered with id ${device.id}`);
  }

  private async authenticateExistingDevice(socket: CompanionSocket, payload: CompanionAuthenticatePayload): Promise<void> {
    const { id, token, platform, appVersion } = payload;
    this.logger.debug(`Authenticating companion device ${id}`);

    const device = await this.service.findById(id!);
    if (!device) {
      this.logger.warn(`No companion device found for id ${id}`);
      return socket.sendEvent(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
    }

    const valid = await this.service.verifyToken(device, token!);
    if (!valid) {
      this.logger.warn(`Invalid token for companion device ${id}`);
      return socket.sendEvent(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
    }

    await this.service.touchLastConnection(device);
    socket.deviceId = device.id;

    const resources = await this.gatewayService.getResourcesForDevice(device.id);
    socket.sendEvent(CompanionEventType.COMPANION_AUTHENTICATED, {
      id: device.id,
      name: device.name,
      resources,
    });

    this.logger.log(`Companion device ${id} authenticated successfully`);
    await this.maybeSendUpdateAvailable(socket, platform, appVersion);
  }

  private async maybeSendUpdateAvailable(socket: CompanionSocket, platform: string | undefined, appVersion: string | undefined): Promise<void> {
    if (!platform || !appVersion) return;

    const latest = this.service.getLatestVersion(platform);
    if (!latest) return;

    if (latest.version !== appVersion) {
      socket.sendEvent(CompanionEventType.COMPANION_UPDATE_AVAILABLE, {
        version: latest.version,
        downloadUrl: latest.downloadUrl,
      });
    }
  }
}
