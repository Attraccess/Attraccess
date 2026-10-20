import { setDeviceFrameLimit } from '../device-enrollment/device-frame-limit';
import { DeviceEnrollmentService } from '../device-enrollment/device-enrollment.service';
import { sendDeviceCredentials } from '../device-enrollment/send-device-credentials';
import { WebSocket } from 'ws';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as semver from 'semver';
import { CompanionService } from './companion.service';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionAuthenticatePayload, CompanionEventType, CompanionSocket } from './companion.types';

@Injectable()
export class CompanionAuthHandler {
  private readonly logger = new Logger(CompanionAuthHandler.name);
  private readonly attempts = new WeakMap<CompanionSocket, symbol>();

  @Inject(DeviceEnrollmentService)
  private readonly enrollment: DeviceEnrollmentService;

  @Inject(CompanionService)
  private readonly service: CompanionService;

  @Inject(CompanionGatewayService)
  private readonly gatewayService: CompanionGatewayService;

  public async handleAuthenticate(socket: CompanionSocket, payload: CompanionAuthenticatePayload): Promise<void> {
    setDeviceFrameLimit(socket, false);
    const attempt = Symbol('companion-authentication');
    this.attempts.set(socket, attempt);
    const current = () =>
      this.attempts.get(socket) === attempt && (socket as unknown as WebSocket).readyState === WebSocket.OPEN;
    if (!current()) return;
    const wasAuthenticated = Boolean(socket.deviceId);
    socket.deviceId = null;
    socket.platform = null;
    socket.arch = null;
    if (wasAuthenticated && (!payload.id || !payload.token)) {
      (socket as unknown as WebSocket).close();
      return;
    }
    if (!payload.id || !payload.token) {
      await this.registerNewDevice(socket, payload);
    } else {
      await this.authenticateExistingDevice(socket, payload, current);
    }
  }

  private async registerNewDevice(socket: CompanionSocket, payload: CompanionAuthenticatePayload): Promise<void> {
    if (socket.deviceId) return;
    const connection = socket as unknown as WebSocket;
    try {
      this.enrollment.announce(
        connection,
        'companion',
        payload.enrollmentCode,
        { platform: payload.platform, arch: payload.arch, appVersion: payload.appVersion },
        async (current) => {
          const { device, token } = await this.service.createDevice(current);
          let attempted = false;
          return {
            id: device.id,
            deliver: async () => {
              if (connection.readyState !== WebSocket.OPEN) throw new Error('Device disconnected');
              attempted = true;
              await sendDeviceCredentials(connection, {
                event: CompanionEventType.COMPANION_REGISTER_RESPONSE,
                data: { id: device.id, token, enrollmentVersion: 1, enrollmentCode: payload.enrollmentCode },
              });
            },
            discard: async () => {
              if (!attempted) await this.service.delete(device.id);
            },
          };
        },
        (message) => socket.sendEvent(CompanionEventType.COMPANION_ENROLLMENT_STATUS, { message }),
      );
    } catch (error) {
      if (connection.readyState === WebSocket.OPEN)
        socket.sendEvent(CompanionEventType.COMPANION_ENROLLMENT_STATUS, {
          message: error instanceof Error ? error.message : 'ENROLLMENT_FAILED',
        });
    }
  }

  private async authenticateExistingDevice(
    socket: CompanionSocket,
    payload: CompanionAuthenticatePayload,
    current: () => boolean,
  ): Promise<void> {
    const deny = () => {
      if (!current()) return;
      socket.sendEvent(CompanionEventType.COMPANION_UNAUTHORIZED, { message: 'PLEASE_REREGISTER' });
      if (!this.enrollment.isPending(socket as unknown as WebSocket)) (socket as unknown as WebSocket).close();
    };
    const { id, token, platform, arch, appVersion } = payload;
    this.logger.debug(`Authenticating companion device ${id}`);

    if (id === undefined || token === undefined) {
      deny();
      return;
    }

    const device = await this.service.findById(id);
    if (!current()) return;
    if (!device) {
      this.logger.warn(`No companion device found for id ${id}`);
      return deny();
    }

    const valid = await this.service.verifyToken(device, token);
    if (!current()) return;
    if (!valid) {
      this.logger.warn(`Invalid token for companion device ${id}`);
      return deny();
    }

    await this.service.touchLastConnection(device, appVersion);
    if (!current()) return;
    const resources = await this.gatewayService.getResourcesForDevice(device.id);
    if (!current()) return;
    this.enrollment.authenticated(socket as unknown as WebSocket);
    socket.deviceId = device.id;
    socket.platform = platform ?? null;
    socket.arch = arch ?? null;

    socket.sendEvent(CompanionEventType.COMPANION_AUTHENTICATED, {
      deviceId: device.id,
      name: device.name,
      resources,
      locked: device.locked,
    });

    this.logger.log(`Companion device ${id} authenticated successfully`);
    await this.maybeSendUpdateAvailable(socket, platform, arch, appVersion);
  }

  private async maybeSendUpdateAvailable(
    socket: CompanionSocket,
    platform: string | undefined,
    arch: string | undefined,
    appVersion: string | undefined,
  ): Promise<void> {
    if (!platform || !appVersion) return;

    const manifest = this.service.getManifest();
    // Use semver.gt so equal/newer-client versions and invalid strings all skip the update,
    // preventing forced downgrades during rolling deploys.
    if (!manifest || !semver.valid(appVersion) || !semver.gt(manifest.version, appVersion)) return;

    // Match by both platform and arch so Linux x64 and arm64 devices get the right binary.
    // Fall back to platform-only match for backwards compatibility with older clients.
    const entry =
      manifest.platforms.find((p) => p.platform === platform && (!arch || p.arch === arch)) ??
      manifest.platforms.find((p) => p.platform === platform);
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
