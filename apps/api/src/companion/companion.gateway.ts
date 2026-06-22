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

  // ATT-623: add @AsyncApiReceive once nestjs-asyncapi is compatible with @nestjs/swagger@11
  @SubscribeMessage('COMPANION_REGISTER')
  async onRegister(@ConnectedSocket() socket: CompanionWebSocket): Promise<void> {
    const { device, token } = await this.companionService.createDevice();
    socket.deviceId = device.id;
    this.logger.log(`Companion device registered: id=${device.id}`);

    this.publishRegisterResponse(socket, { id: device.id, token });
    await this.publishAuthenticated(socket);
  }

  // ATT-623: add @AsyncApiReceive once nestjs-asyncapi is compatible with @nestjs/swagger@11
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

  // ─── Server → Client ─────────────────────────────────────────────────────

  private publishRequestAuthentication(socket: CompanionWebSocket): void {
    socket.sendEvent('COMPANION_REQUEST_AUTHENTICATION');
  }

  private publishRegisterResponse(socket: CompanionWebSocket, payload: CompanionRegisterResponseDto): void {
    socket.sendEvent('COMPANION_REGISTER_RESPONSE', payload);
  }

  private async publishAuthenticated(socket: CompanionWebSocket): Promise<void> {
    if (!socket.deviceId) return;
    const device = await this.companionService.findById(socket.deviceId);
    if (!device) return;

    const payload: CompanionAuthenticatedDto = {
      deviceId: device.id,
      deviceName: device.name,
      resources: (device.resources ?? []).map((r) => ({ id: r.id, name: r.name })),
    };
    socket.sendEvent('COMPANION_AUTHENTICATED', payload);
  }

  public async sendLockPc(deviceId: number): Promise<void> {
    for (const socket of this.socketsForDevice(deviceId)) {
      socket.sendEvent('COMPANION_LOCK_PC');
    }
  }

  public async sendUnlockPc(deviceId: number): Promise<void> {
    for (const socket of this.socketsForDevice(deviceId)) {
      socket.sendEvent('COMPANION_UNLOCK_PC');
    }
  }

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
