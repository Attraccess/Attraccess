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
import {
  CompanionAuthenticateDto,
  CompanionAuthenticatedDto,
  CompanionRegisterResponseDto,
  CompanionUpdateAvailableDto,
  CompanionAuthenticatePayload,
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

    Object.assign(client, { id, deviceId: null, sendEvent });
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

  // ─── Server → Client ─────────────────────────────────────────────────────

  @AsyncApiSub({
    channel: 'COMPANION_REQUEST_AUTHENTICATION',
    message: { name: 'COMPANION_REQUEST_AUTHENTICATION', payload: Object },
    summary: 'Server requests the client to authenticate or register',
  })
  private publishRequestAuthentication(socket: CompanionSocket): void {
    socket.sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION);
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
    this.gatewayService.sendLockCommand(deviceId);
  }

  @AsyncApiSub({
    channel: 'COMPANION_UNLOCK_PC',
    message: { name: 'COMPANION_UNLOCK_PC', payload: Object },
    summary: 'Server instructs the companion to unlock the PC',
  })
  public sendUnlockPc(deviceId: number): void {
    this.gatewayService.sendUnlockCommand(deviceId);
  }

  @AsyncApiSub({
    channel: 'COMPANION_UPDATE_AVAILABLE',
    message: { name: 'COMPANION_UPDATE_AVAILABLE', payload: CompanionUpdateAvailableDto },
    summary: 'Notifies the companion that a new version is available',
  })
  public sendUpdateAvailable(deviceId: number, payload: CompanionUpdateAvailableDto): void {
    for (const socket of [...this.gatewayService.sockets.values()].filter((s) => s.deviceId === deviceId)) {
      socket.sendEvent(CompanionEventType.COMPANION_UPDATE_AVAILABLE, payload);
    }
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
