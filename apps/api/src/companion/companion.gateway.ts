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
import { Inject, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CompanionService } from './companion.service';
import {
  CompanionWebSocket,
  CompanionEventType,
  CompanionRegisterPayload,
  CompanionAuthenticatedPayload,
} from './companion.types';

@WebSocketGateway({ path: '/api/companion/websocket' })
export class CompanionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CompanionGateway.name);

  @Inject(CompanionService)
  private companionService: CompanionService;

  private readonly sockets = new Map<string, CompanionWebSocket>();

  public async handleConnection(client: WebSocket) {
    const id = randomBytes(4).toString('base64url').slice(0, 6);

    const sendEvent = (type: CompanionEventType, payload: unknown = {}) => {
      (client as unknown as { send: (d: string) => void }).send(JSON.stringify({ event: 'EVENT', data: { type, payload } }));
    };

    Object.assign(client, { id, deviceId: null, sendEvent });
    this.sockets.set(id, client as unknown as CompanionWebSocket);

    this.logger.log(`Companion client connected: ${id}`);
    sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION);
  }

  public handleDisconnect(client: CompanionWebSocket) {
    this.logger.log(`Companion client disconnected: ${client.id}`);
    this.sockets.delete(client.id);
  }

  @SubscribeMessage('EVENT')
  public async onEvent(
    @MessageBody() data: { type: CompanionEventType; payload: unknown },
    @ConnectedSocket() socket: CompanionWebSocket,
  ) {
    switch (data.type) {
      case CompanionEventType.COMPANION_REGISTER:
        await this.handleRegister(socket, data.payload as CompanionRegisterPayload);
        break;
      case CompanionEventType.COMPANION_AUTHENTICATE:
        await this.handleAuthenticate(socket, data.payload as CompanionRegisterPayload);
        break;
      default:
        this.logger.warn(`Unknown companion event type: ${data.type}`);
    }
  }

  private async handleRegister(socket: CompanionWebSocket, payload: CompanionRegisterPayload) {
    const { device, token } = await this.companionService.createDevice();
    socket.deviceId = device.id;

    socket.sendEvent(CompanionEventType.COMPANION_REGISTER, { id: device.id, token });
    this.logger.log(`Companion device registered: id=${device.id}`);

    await this.sendAuthenticated(socket);
  }

  private async handleAuthenticate(socket: CompanionWebSocket, payload: CompanionRegisterPayload) {
    if (!payload.id || !payload.token) {
      this.logger.warn('Companion authenticate: missing id or token, requesting re-registration');
      socket.sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION);
      return;
    }

    const device = await this.companionService.findById(payload.id);
    if (!device) {
      this.logger.warn(`Companion authenticate: device ${payload.id} not found`);
      socket.sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION);
      return;
    }

    const valid = await this.companionService.verifyToken(device, payload.token);
    if (!valid) {
      this.logger.warn(`Companion authenticate: invalid token for device ${payload.id}`);
      socket.sendEvent(CompanionEventType.COMPANION_REQUEST_AUTHENTICATION);
      return;
    }

    socket.deviceId = device.id;
    await this.companionService.touchLastConnection(device);
    await this.sendAuthenticated(socket);
  }

  private async sendAuthenticated(socket: CompanionWebSocket) {
    const device = await this.companionService.findById(socket.deviceId!);
    if (!device) return;

    const payload: CompanionAuthenticatedPayload = {
      deviceId: device.id,
      deviceName: device.name,
      resources: (device.resources ?? []).map((r) => ({ id: r.id, name: r.name })),
    };
    socket.sendEvent(CompanionEventType.COMPANION_AUTHENTICATED, payload);
  }

  public async sendLockPc(deviceId: number) {
    for (const socket of this.sockets.values()) {
      if (socket.deviceId === deviceId) {
        socket.sendEvent(CompanionEventType.COMPANION_LOCK_PC);
      }
    }
  }

  public async sendUnlockPc(deviceId: number) {
    for (const socket of this.sockets.values()) {
      if (socket.deviceId === deviceId) {
        socket.sendEvent(CompanionEventType.COMPANION_UNLOCK_PC);
      }
    }
  }

  public async sendUpdateAvailable(deviceId: number, downloadUrl: string, version: string) {
    for (const socket of this.sockets.values()) {
      if (socket.deviceId === deviceId) {
        socket.sendEvent(CompanionEventType.COMPANION_UPDATE_AVAILABLE, { downloadUrl, version });
      }
    }
  }
}
