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
import { AsyncApiPub, AsyncApiSub } from 'nestjs-asyncapi';
import { CompanionService } from './companion.service';
import {
  CompanionAuthenticateDto,
  CompanionAuthenticatedDto,
  CompanionRegisterResponseDto,
  CompanionUpdateAvailableDto,
  CompanionWebSocket,
} from './companion.types';

@WebSocketGateway({ path: '/api/companion/websocket' })
export class CompanionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CompanionGateway.name);
  private readonly sockets = new Map<string, CompanionWebSocket>();

  @Inject(CompanionService)
  private companionService: CompanionService;

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  public handleConnection(client: WebSocket) {
    const id = randomBytes(4).toString('base64url').slice(0, 6);

    const sendEvent = (event: string, payload: unknown = {}) => {
      (client as unknown as { send: (d: string) => void }).send(JSON.stringify({ event, data: payload }));
    };

    Object.assign(client, { id, deviceId: null, sendEvent });
    this.sockets.set(id, client as unknown as CompanionWebSocket);

    this.logger.log(`Companion client connected: ${id}`);
    this.publishRequestAuthentication(client as unknown as CompanionWebSocket);
  }

  public handleDisconnect(client: CompanionWebSocket) {
    this.logger.log(`Companion client disconnected: ${client.id}`);
    this.sockets.delete(client.id);
  }

  // ─── Client → Server ─────────────────────────────────────────────────────

  @AsyncApiSub({
    channel: 'COMPANION_REGISTER',
    message: { name: 'COMPANION_REGISTER', payload: { type: Object } },
    description: 'Client requests a new device registration (first run only). No payload required.',
  })
  @SubscribeMessage('COMPANION_REGISTER')
  async onRegister(@ConnectedSocket() socket: CompanionWebSocket): Promise<void> {
    const { device, token } = await this.companionService.createDevice();
    socket.deviceId = device.id;
    this.logger.log(`Companion device registered: id=${device.id}`);

    this.publishRegisterResponse(socket, { id: device.id, token });
    await this.publishAuthenticated(socket);
  }

  @AsyncApiSub({
    channel: 'COMPANION_AUTHENTICATE',
    message: { name: 'COMPANION_AUTHENTICATE', payload: { type: CompanionAuthenticateDto } },
    description:
      'Client authenticates with stored credentials. Send empty payload {} on first run to trigger re-registration.',
  })
  @SubscribeMessage('COMPANION_AUTHENTICATE')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async onAuthenticate(
    @MessageBody() body: CompanionAuthenticateDto,
    @ConnectedSocket() socket: CompanionWebSocket,
  ): Promise<void> {
    if (!body.id || !body.token) {
      this.logger.warn(`Companion ${socket.id}: missing credentials, requesting re-registration`);
      this.publishRequestAuthentication(socket);
      return;
    }

    const device = await this.companionService.findById(body.id);
    if (!device || !(await this.companionService.verifyToken(device, body.token))) {
      this.logger.warn(`Companion ${socket.id}: invalid credentials for device ${body.id}`);
      this.publishRequestAuthentication(socket);
      return;
    }

    socket.deviceId = device.id;
    await this.companionService.touchLastConnection(device);
    await this.publishAuthenticated(socket);
  }

  // ─── Server → Client (publishers) ────────────────────────────────────────

  @AsyncApiPub({
    channel: 'COMPANION_REQUEST_AUTHENTICATION',
    message: { name: 'COMPANION_REQUEST_AUTHENTICATION', payload: { type: Object } },
    description:
      'Server requests credentials. Client should respond with COMPANION_AUTHENTICATE or COMPANION_REGISTER.',
  })
  private publishRequestAuthentication(socket: CompanionWebSocket): void {
    socket.sendEvent('COMPANION_REQUEST_AUTHENTICATION');
  }

  @AsyncApiPub({
    channel: 'COMPANION_REGISTER',
    message: { name: 'COMPANION_REGISTER_RESPONSE', payload: { type: CompanionRegisterResponseDto } },
    description: 'Server responds to COMPANION_REGISTER with the assigned device credentials to store in the keychain.',
  })
  private publishRegisterResponse(socket: CompanionWebSocket, payload: CompanionRegisterResponseDto): void {
    socket.sendEvent('COMPANION_REGISTER', payload);
  }

  @AsyncApiPub({
    channel: 'COMPANION_AUTHENTICATED',
    message: { name: 'COMPANION_AUTHENTICATED', payload: { type: CompanionAuthenticatedDto } },
    description: 'Server confirms authentication and provides the resource list for kiosk URL selection.',
  })
  private async publishAuthenticated(socket: CompanionWebSocket): Promise<void> {
    const device = await this.companionService.findById(socket.deviceId!);
    if (!device) return;

    const payload: CompanionAuthenticatedDto = {
      deviceId: device.id,
      deviceName: device.name,
      resources: (device.resources ?? []).map((r) => ({ id: r.id, name: r.name })),
    };
    socket.sendEvent('COMPANION_AUTHENTICATED', payload);
  }

  @AsyncApiPub({
    channel: 'COMPANION_LOCK_PC',
    message: { name: 'COMPANION_LOCK_PC', payload: { type: Object } },
    description: 'Server instructs the companion to show the fullscreen lockscreen overlay.',
  })
  public async sendLockPc(deviceId: number): Promise<void> {
    for (const socket of this.socketsForDevice(deviceId)) {
      socket.sendEvent('COMPANION_LOCK_PC');
    }
  }

  @AsyncApiPub({
    channel: 'COMPANION_UNLOCK_PC',
    message: { name: 'COMPANION_UNLOCK_PC', payload: { type: Object } },
    description: 'Server instructs the companion to dismiss the lockscreen overlay and clear the webview session.',
  })
  public async sendUnlockPc(deviceId: number): Promise<void> {
    for (const socket of this.socketsForDevice(deviceId)) {
      socket.sendEvent('COMPANION_UNLOCK_PC');
    }
  }

  @AsyncApiPub({
    channel: 'COMPANION_UPDATE_AVAILABLE',
    message: { name: 'COMPANION_UPDATE_AVAILABLE', payload: { type: CompanionUpdateAvailableDto } },
    description: 'Server notifies the companion that a new version is available for download.',
  })
  public async sendUpdateAvailable(deviceId: number, payload: CompanionUpdateAvailableDto): Promise<void> {
    for (const socket of this.socketsForDevice(deviceId)) {
      socket.sendEvent('COMPANION_UPDATE_AVAILABLE', payload);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private socketsForDevice(deviceId: number): CompanionWebSocket[] {
    return Array.from(this.sockets.values()).filter((s) => s.deviceId === deviceId);
  }
}
