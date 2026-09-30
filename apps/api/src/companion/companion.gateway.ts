import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { Inject, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AsyncApi, AsyncApiPub, AsyncApiSub } from 'nestjs-asyncapi';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionAuthHandler } from './companion-auth.handler';
import { CompanionAuthenticated } from './companion-authenticated.decorator';
import {
  CompanionAuthenticateDto,
  CompanionAuthenticatedDto,
  CompanionDeviceRenamedDto,
  CompanionRegisterResponseDto,
  CompanionUpdateAvailableDto,
  CompanionAuthenticatePayload,
  CompanionIdleDto,
  CompanionForegroundAppDto,
  CompanionUsbDeviceDto,
  CompanionSocket,
  CompanionEventType,
} from './companion.types';

@AsyncApi()
@WebSocketGateway({ path: '/api/companion/websocket' })
export class CompanionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CompanionGateway.name);

  @Inject(CompanionGatewayService)
  private readonly gatewayService: CompanionGatewayService;

  @Inject(CompanionAuthHandler)
  private readonly authHandler: CompanionAuthHandler;

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  public handleConnection(client: WebSocket) {
    const id = randomBytes(4).toString('base64url').slice(0, 6);

    const sendEvent = (type: CompanionEventType, payload: unknown = {}) => {
      (client as unknown as { send: (d: string) => void }).send(JSON.stringify({ event: type, data: payload }));
    };

    Object.assign(client, { id, deviceId: null, platform: null, arch: null, sendEvent });
    this.gatewayService.sockets.set(id, client as unknown as CompanionSocket);

    this.logger.log(`Companion client connected: ${id}`);
    this.publishRequestAuthentication(client as unknown as CompanionSocket);
  }

  public handleDisconnect(client: CompanionSocket) {
    this.logger.log(`Companion client disconnected: ${client.id}`);
    this.gatewayService.sockets.delete(client.id);
  }

  // ─── Client → Server ─────────────────────────────────────────────────────

  @SubscribeMessage('COMPANION_REGISTER')
  @AsyncApiPub({
    channel: 'COMPANION_REGISTER',
    message: { name: 'COMPANION_REGISTER', payload: Object },
    summary: 'Register a new companion device (first run)',
  })
  async onRegister(@ConnectedSocket() socket: CompanionSocket): Promise<void> {
    await this.authHandler.handleAuthenticate(socket, {});
  }

  @SubscribeMessage('COMPANION_AUTHENTICATE')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_AUTHENTICATE',
    message: { name: 'COMPANION_AUTHENTICATE', payload: CompanionAuthenticateDto },
    summary: 'Authenticate with stored device credentials',
  })
  async onAuthenticate(
    @MessageBody() body: CompanionAuthenticateDto,
    @ConnectedSocket() socket: CompanionSocket,
  ): Promise<void> {
    await this.authHandler.handleAuthenticate(socket, body as CompanionAuthenticatePayload);
  }

  @SubscribeMessage('COMPANION_IDLE')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_IDLE',
    message: { name: 'COMPANION_IDLE', payload: CompanionIdleDto },
    summary: 'Companion reports that the machine has become idle',
  })
  onIdle(
    @MessageBody() body: CompanionIdleDto,
    @ConnectedSocket() socket: CompanionSocket,
  ): void {
    this.gatewayService.handleIdleEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_ACTIVE')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_ACTIVE',
    message: { name: 'COMPANION_ACTIVE', payload: CompanionIdleDto },
    summary: 'Companion reports that the machine has become active after being idle',
  })
  onActive(
    @MessageBody() body: CompanionIdleDto,
    @ConnectedSocket() socket: CompanionSocket,
  ): void {
    this.gatewayService.handleActiveEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_FOREGROUND_APP')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_FOREGROUND_APP',
    message: { name: 'COMPANION_FOREGROUND_APP', payload: CompanionForegroundAppDto },
    summary: 'Companion reports the currently focused foreground application',
  })
  onForegroundApp(
    @MessageBody() body: CompanionForegroundAppDto,
    @ConnectedSocket() socket: CompanionSocket,
  ): void {
    this.gatewayService.handleForegroundAppEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_USB_CONNECTED')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_USB_CONNECTED',
    message: { name: 'COMPANION_USB_CONNECTED', payload: CompanionUsbDeviceDto },
    summary: 'Companion reports that a USB device was connected',
  })
  onUsbConnected(
    @MessageBody() body: CompanionUsbDeviceDto,
    @ConnectedSocket() socket: CompanionSocket,
  ): void {
    this.gatewayService.handleUsbConnectedEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_USB_DISCONNECTED')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_USB_DISCONNECTED',
    message: { name: 'COMPANION_USB_DISCONNECTED', payload: CompanionUsbDeviceDto },
    summary: 'Companion reports that a USB device was disconnected',
  })
  onUsbDisconnected(
    @MessageBody() body: CompanionUsbDeviceDto,
    @ConnectedSocket() socket: CompanionSocket,
  ): void {
    this.gatewayService.handleUsbDisconnectedEvent(socket.deviceId as number, body);
  }

  // ─── Server → Client ─────────────────────────────────────────────────────

  @AsyncApiSub({
    channel: 'COMPANION_REQUEST_AUTHENTICATION',
    message: { name: 'COMPANION_REQUEST_AUTHENTICATION', payload: Object },
    summary: 'Server requests the client to authenticate or register',
  })
  private publishRequestAuthentication(socket: CompanionSocket): void {
    socket.sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION, {});
  }

  // ponytail: @AsyncApiSub stubs below — events emitted by CompanionAuthHandler, documented here for AsyncAPI spec

  @AsyncApiSub({
    channel: 'COMPANION_REGISTER_RESPONSE',
    message: { name: 'COMPANION_REGISTER_RESPONSE', payload: CompanionRegisterResponseDto },
    summary: 'Response to COMPANION_REGISTER with assigned credentials',
  })
  private _specRegisterResponse() { /* emitted by CompanionAuthHandler.registerNewDevice */ }

  @AsyncApiSub({
    channel: 'COMPANION_AUTHENTICATED',
    message: { name: 'COMPANION_AUTHENTICATED', payload: CompanionAuthenticatedDto },
    summary: 'Sent after successful authentication with device info and resources',
  })
  private _specAuthenticated() { /* emitted by CompanionAuthHandler.authenticateExistingDevice */ }

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
  private _specUpdateAvailable() { /* emitted by CompanionAuthHandler.maybeSendUpdateAvailable on connect */ }

  @AsyncApiSub({
    channel: 'COMPANION_DEVICE_RENAMED',
    message: { name: 'COMPANION_DEVICE_RENAMED', payload: CompanionDeviceRenamedDto },
    summary: 'Notifies the companion that its display name has been changed by an admin',
  })
  private _specDeviceRenamed() { /* emitted by CompanionGatewayService.sendDeviceRenamed */ }

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
