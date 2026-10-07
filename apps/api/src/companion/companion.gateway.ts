import { Inject, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomBytes } from 'crypto';
import { AsyncApi, AsyncApiPub } from 'nestjs-asyncapi';
import { Server } from 'ws';
import { CompanionAuthHandler } from './companion-auth.handler';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionServerEventsImplementation } from './companion-server-events';
import {
  CompanionAuthenticateDto,
  CompanionAuthenticatePayload,
  CompanionEventType,
  CompanionSocket,
} from './companion.types';

@AsyncApi()
@WebSocketGateway({ path: '/api/companion/websocket' })
export class CompanionGateway
  extends CompanionServerEventsImplementation
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  protected readonly logger = new Logger(CompanionGateway.name);

  @Inject(CompanionGatewayService)
  protected readonly gatewayService: CompanionGatewayService;

  @Inject(CompanionAuthHandler)
  protected readonly authHandler: CompanionAuthHandler;

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

  // ─── Server → Client ─────────────────────────────────────────────────────
  // ponytail: @AsyncApiSub stubs below — events emitted by CompanionAuthHandler, documented here for AsyncAPI spec
}
