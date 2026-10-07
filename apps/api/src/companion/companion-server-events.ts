import { AsyncApiSub } from 'nestjs-asyncapi';
import { CompanionDeviceEventsImplementation } from './companion-device-events';
import {
  CompanionAuthenticatedDto,
  CompanionDeviceRenamedDto,
  CompanionEventType,
  CompanionRegisterResponseDto,
  CompanionSocket,
  CompanionUpdateAvailableDto,
} from './companion.types';
export abstract class CompanionServerEventsImplementation extends CompanionDeviceEventsImplementation {
  // ─── Server → Client ─────────────────────────────────────────────────────

  @AsyncApiSub({
    channel: 'COMPANION_REQUEST_AUTHENTICATION',
    message: { name: 'COMPANION_REQUEST_AUTHENTICATION', payload: Object },
    summary: 'Server requests the client to authenticate or register',
  })
  protected publishRequestAuthentication(socket: CompanionSocket): void {
    socket.sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION, {});
  }

  // ponytail: @AsyncApiSub stubs below — events emitted by CompanionAuthHandler, documented here for AsyncAPI spec

  @AsyncApiSub({
    channel: 'COMPANION_REGISTER_RESPONSE',
    message: { name: 'COMPANION_REGISTER_RESPONSE', payload: CompanionRegisterResponseDto },
    summary: 'Response to COMPANION_REGISTER with assigned credentials',
  })
  protected _specRegisterResponse() {
    /* emitted by CompanionAuthHandler.registerNewDevice */
  }

  @AsyncApiSub({
    channel: 'COMPANION_AUTHENTICATED',
    message: { name: 'COMPANION_AUTHENTICATED', payload: CompanionAuthenticatedDto },
    summary: 'Sent after successful authentication with device info and resources',
  })
  protected _specAuthenticated() {
    /* emitted by CompanionAuthHandler.authenticateExistingDevice */
  }

  @AsyncApiSub({
    channel: 'COMPANION_LOCK_PC',
    message: { name: 'COMPANION_LOCK_PC', payload: Object },
    summary: 'Server instructs the companion to lock the PC',
  })
  public sendLockPc(deviceId: number): void {
    void this.gatewayService.sendLockCommand(deviceId);
  }

  @AsyncApiSub({
    channel: 'COMPANION_UNLOCK_PC',
    message: { name: 'COMPANION_UNLOCK_PC', payload: Object },
    summary: 'Server instructs the companion to unlock the PC',
  })
  public sendUnlockPc(deviceId: number): void {
    void this.gatewayService.sendUnlockCommand(deviceId);
  }

  @AsyncApiSub({
    channel: 'COMPANION_UPDATE_AVAILABLE',
    message: { name: 'COMPANION_UPDATE_AVAILABLE', payload: CompanionUpdateAvailableDto },
    summary: 'Notifies the companion that a new version is available',
  })
  protected _specUpdateAvailable() {
    /* emitted by CompanionAuthHandler.maybeSendUpdateAvailable on connect */
  }

  @AsyncApiSub({
    channel: 'COMPANION_DEVICE_RENAMED',
    message: { name: 'COMPANION_DEVICE_RENAMED', payload: CompanionDeviceRenamedDto },
    summary: 'Notifies the companion that its display name has been changed by an admin',
  })
  protected _specDeviceRenamed() {
    /* emitted by CompanionGatewayService.sendDeviceRenamed */
  }

  public disconnectDevice(deviceId: number): void {
    for (const s of [...this.gatewayService.sockets.values()].filter((s) => s.deviceId === deviceId)) {
      try {
        (s as unknown as { close(): void }).close();
      } catch {
        // ignore
      }
    }
  }
}
