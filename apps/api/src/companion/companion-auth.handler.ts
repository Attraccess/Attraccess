import { Inject, Injectable, Logger } from '@nestjs/common';
import * as semver from 'semver';
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
    socket.sendEvent(CompanionEventType.COMPANION_REGISTER_RESPONSE, { id: device.id, token });
    this.logger.log(`New companion device registered with id ${device.id}`);
  }

  private async authenticateExistingDevice(socket: CompanionSocket, payload: CompanionAuthenticatePayload): Promise<void> {
    const { id, token, platform, arch, appVersion } = payload;
    this.logger.debug(`Authenticating companion device ${id}`);

    if (id === undefined || token === undefined) {
      return socket.sendEvent(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
    }

    const device = await this.service.findById(id);
    if (!device) {
      this.logger.warn(`No companion device found for id ${id}`);
      return socket.sendEvent(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
    }

    const valid = await this.service.verifyToken(device, token);
    if (!valid) {
      this.logger.warn(`Invalid token for companion device ${id}`);
      return socket.sendEvent(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
    }

    await this.service.touchLastConnection(device, appVersion);
    socket.deviceId = device.id;
    socket.platform = platform ?? null;
    socket.arch = arch ?? null;

    const resources = await this.gatewayService.getResourcesForDevice(device.id);
    socket.sendEvent(CompanionEventType.COMPANION_AUTHENTICATED, {
      deviceId: device.id,
      name: device.name,
      resources,
      locked: device.locked,
    });

    this.logger.log(`Companion device ${id} authenticated successfully`);
    await this.maybeSendUpdateAvailable(socket, platform, arch, appVersion);
  }

  private async maybeSendUpdateAvailable(socket: CompanionSocket, platform: string | undefined, arch: string | undefined, appVersion: string | undefined): Promise<void> {
    if (!platform || !appVersion) return;

    const manifest = this.service.getManifest();
    // Use semver.gt so equal/newer-client versions and invalid strings all skip the update,
    // preventing forced downgrades during rolling deploys.
    if (!manifest || !semver.valid(appVersion) || !semver.gt(manifest.version, appVersion)) return;

    // Match by both platform and arch so Linux x64 and arm64 devices get the right binary.
    // Fall back to platform-only match for backwards compatibility with older clients.
    const entry = manifest.platforms.find((p) => p.platform === platform && (!arch || p.arch === arch))
      ?? manifest.platforms.find((p) => p.platform === platform);
    const downloadUrl = entry
      ? `/api/companion/download/${entry.platform}/${entry.arch}`
      : `/api/companion/download/${platform}/x64`;

    socket.sendEvent(CompanionEventType.COMPANION_UPDATE_AVAILABLE, {
      version: manifest.version,
      downloadUrl,
      ...(entry?.sha256 ? { sha256: entry.sha256 } : {}),
    });
  }
}
