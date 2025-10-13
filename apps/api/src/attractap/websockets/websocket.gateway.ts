import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayDisconnect,
  OnGatewayConnection,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { Inject, Logger } from '@nestjs/common';
import { WebsocketService } from './websocket.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapMessage, AttractapEventType } from './websocket.types';
import { AttractapService } from '../attractap.service';
import { nanoid } from 'nanoid';
import { UsersService } from '../../users-and-auth/users/users.service';
import { AttractapFirmwareService } from '../firmware.service';
import { Mutex } from 'async-mutex';
import { LicenseModuleType, LicenseService } from '../../license/license.service';
import { AttractapFirmware } from '../dtos/firmware.dto';
import { verifyToken } from './websocket.utils';
import { Resource, ResourceBillingConfiguration, ResourceIntroducer, User } from '@attraccess/database-entities';

@WebSocketGateway({ path: '/api/attractap/websocket' })
export class AttractapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AttractapGateway.name);
  private readonly clientResponseAwaitersMutex = new Mutex();

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(AttractapFirmwareService)
  private firmwareService: AttractapFirmwareService;

  @Inject(LicenseService)
  private licenseService: LicenseService;

  private makeStringLVGLReady(input: string): string {
    if (!input) return input;

    // Step 1: Explicit language-aware replacements (keep before diacritic removal)
    const explicitReplacements: Array<[RegExp, string]> = [
      // German umlauts and sharp s
      [/ä/g, 'ae'],
      [/ö/g, 'oe'],
      [/ü/g, 'ue'],
      [/Ä/g, 'Ae'],
      [/Ö/g, 'Oe'],
      [/Ü/g, 'Ue'],
      [/ß/g, 'ss'],

      // Common symbols and punctuation
      [/\u00A0/g, ' '], // NBSP -> space
      [/\u2018|\u2019|\u201A|\u2032/g, "'"], // smart single quotes, prime
      [/\u201C|\u201D|\u201E|\u2033/g, '"'], // smart double quotes, double prime
      [/\u2013|\u2014|\u2015/g, '-'], // en/em/horizontal bar -> hyphen
      [/\u2026/g, '...'], // ellipsis
      [/\u2022/g, '-'], // bullet -> hyphen
      [/\u00B0/g, 'deg'], // degree
      [/\u2122/g, 'TM'], // trademark
      [/\u00AE/g, '(R)'], // registered
    ];

    let output = input;
    for (const [pattern, replacement] of explicitReplacements) {
      output = output.replace(pattern, replacement);
    }

    // Step 2: Remove remaining diacritics (NFD decomposition)
    output = output.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Step 3: Replace any remaining non-ASCII characters with '?'
    // Allow printable ASCII range only (space 0x20 to tilde 0x7E)
    output = output.replace(/[^\x20-\x7E]/g, '?');

    return output;
  }

  private sanitizeForLVGL<T>(value: T): T {
    const seen = new WeakSet<object>();

    const sanitize = (v: unknown): unknown => {
      if (typeof v === 'string') return this.makeStringLVGLReady(v);
      if (v === null || v === undefined) return v;
      if (Array.isArray(v)) return v.map((item) => sanitize(item));
      if (typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        if (seen.has(obj)) return obj;
        seen.add(obj);
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(obj)) {
          out[k] = sanitize(val);
        }
        return out;
      }
      return v;
    };

    return sanitize(value) as T;
  }

  public async handleConnection(client: AuthenticatedWebSocket) {
    this.logger.log('Client connected via WebSocket');

    try {
      await this.licenseService.verifyLicense({
        modules: [LicenseModuleType.ATTRACTAP],
      });
    } catch (error) {
      this.logger.error('Closing connection due to license error');
      this.logger.error(error);
      client.close();
      return;
    }

    client.id = nanoid(5);

    client.sendMessage = async (message: AttractapMessage) => {
      const RETRY_COUNT = 3;

      let lastError: Error | undefined;

      for (let i = 0; i < RETRY_COUNT; i++) {
        this.logger.debug(
          `Sending ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
          message.data.payload,
        );
        const sanitized = this.sanitizeForLVGL(message);
        const stringifiedMessage = JSON.stringify(sanitized);
        (client as unknown as WebSocket).send(stringifiedMessage);

        this.logger.debug(
          `Waiting for response for ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
        );
        try {
          await this.waitForClientResponse(client, message.data.type);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error as Error;
          this.logger.debug(`Attempt ${i + 1} failed: ${error.message}`);
        }
      }

      if (lastError) {
        this.logger.error(
          `Client did not send ACK for ${message.data.type} after ${RETRY_COUNT} attempts. Closing connection.`,
        );
        throw lastError;
      }
    };

    client.sendBinaryData = (data: Buffer) => {
      this.logger.verbose(`Sending binary data: ${data.length} bytes`);
      (client as unknown as WebSocket).send(data);
    };

    this.websocketService.sockets.set(client.id, client);

    await this.clientWasActive(client);

    this.logger.debug('Sending authentication request');
    await client.sendMessage(new AttractapEvent(AttractapEventType.READER_REQUEST_AUTHENTICATION, {}));
  }

  private clientResponseAwaiters: Array<{
    id: string;
    clientId: string;
    type: AttractapEventType;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  private async waitForClientResponse(client: AuthenticatedWebSocket, type: AttractapEventType, timeoutMs = 4000) {
    const id = nanoid(5);

    const removeAwaiter = async () => {
      await this.clientResponseAwaitersMutex
        .runExclusive(async () => {
          this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.id !== id);
        })
        .catch((error) => {
          this.logger.error(`Error removing awaiter: ${error}`);
        });
    };

    // TODO: refactor wait for response to rely on ACK messages instead of response mesaages
    return await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        removeAwaiter();
        reject(new Error(`Timeout waiting for client response of type ${type}`));
      }, timeoutMs);

      const onResolve = () => {
        clearTimeout(timeoutId);
        resolve();
        removeAwaiter();
      };

      this.clientResponseAwaiters.push({ id, clientId: client.id, type, resolve: onResolve, timeoutId });
    });
  }

  private async resolveClientResponseAwaiters(client: AuthenticatedWebSocket, type: AttractapEventType) {
    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      const matchingAwaiters = this.clientResponseAwaiters.filter(
        (awaiter) => awaiter.clientId === client.id && awaiter.type === type,
      );

      this.logger.debug(
        `Found ${matchingAwaiters.length} awaiters for client ${client.id} for event ${type} to resolve`,
      );

      matchingAwaiters.forEach((awaiter) => {
        awaiter.resolve();
        clearTimeout(awaiter.timeoutId);
      });

      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.clientId !== client.id);
    });
  }
  public async handleDisconnect(socket: AuthenticatedWebSocket) {
    this.logger.debug(`Client ${socket.id} disconnected.`);

    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.clientId !== socket.id);
    });

    const readerId = socket.readerId;
    if (readerId) {
      this.logger.log(`Client for reader ${readerId} disconnected.`);
    } else {
      this.logger.log('An unidentified client disconnected.');
    }

    this.websocketService.sockets.delete(socket.id);
  }

  private async clientWasActive(socket: AuthenticatedWebSocket) {
    if (socket.readerId) {
      await this.attractapService.updateLastReaderConnection(socket.readerId);
    }
  }

  @SubscribeMessage('HEARTBEAT')
  public async onHeartbeat(@ConnectedSocket() socket: AuthenticatedWebSocket) {
    this.logger.debug(`Heartbeat from client ${socket.id}.`);

    await this.clientWasActive(socket);
  }

  @SubscribeMessage('EVENT')
  public async onClientEvent(
    @MessageBody() eventData: AttractapEvent['data'],
    @ConnectedSocket() socket: AuthenticatedWebSocket,
  ) {
    if (eventData.type.startsWith('ACK_')) {
      this.logger.debug(`Received ACK response from client ${socket.id}: ${JSON.stringify(eventData)}`);

      this.resolveClientResponseAwaiters(socket, eventData.type.replace('ACK_', '') as AttractapEventType);
      return;
    }

    if (
      !socket.readerId &&
      ![AttractapEventType.READER_AUTHENTICATE, AttractapEventType.READER_REGISTER].includes(eventData.type)
    ) {
      this.logger.error('Client has no reader attached. ignoring event.');
      return;
    }

    await this.clientWasActive(socket);

    this.logger.debug(`Received event from client ${socket.id}: ${JSON.stringify(eventData)}`);

    switch (eventData.type) {
      case AttractapEventType.READER_REGISTER:
        await this.handleReaderRegister(socket, eventData);
        break;
      case AttractapEventType.READER_AUTHENTICATE:
        await this.handleAuthentication(socket, eventData);
        break;
      case AttractapEventType.READER_FIRMWARE_INFO:
        await this.handleFirmwareInfo(socket, eventData);
        break;
      case AttractapEventType.READER_AUTHENTICATED:
      case AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED:
      case AttractapEventType.READER_FIRMWARE_STREAM_CHUNK:
        // TODO: implement firmware updates
        break;
      case AttractapEventType.RESOURCE_LIST:
      case AttractapEventType.READER_UNAUTHORIZED:
      case AttractapEventType.READER_REQUEST_AUTHENTICATION:
        this.logger.error(
          `Received event of type ${eventData.type} from client ${socket.id}, this is a server side only event, clients should not send this event`,
        );
        throw new Error('THIS IS A SERVER SIDE ONLY EVENT, CLIENTS SHOULD NOT SEND THIS EVENT');
      default: {
        const exhaustiveCheck: never = eventData.type;
        throw new Error(`Unknown event type: ${exhaustiveCheck}`);
      }
    }
  }

  private async handleFirmwareInfo(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    await this.attractapService.updateReaderFirmware(socket.readerId, data.payload);

    const firmwareIsUpToDate = await this.isFirmwareLatest(data.payload);
    if (!firmwareIsUpToDate) {
      this.logger.debug('Firmware is not up to date, moving reader to WaitForFirmwareUpdateState');
      // TODO: send info about firmware update
      return;
    }
  }

  private async isFirmwareLatest(firmware: AttractapFirmware): Promise<boolean> {
    const firmwareDefinition = await this.firmwareService.getFirmwareDefinition(firmware.name, firmware.variant);

    if (!firmwareDefinition) {
      return true;
    }

    return String(firmwareDefinition.version) === String(firmware.version);
  }

  private async handleReaderRegister(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.logger.debug('Received REGISTER event');
    const response = await this.attractapService.createNewReader(data.payload.firmware);

    this.logger.debug(
      `Sending REGISTER response to client. Reader ID: ${response.reader.id}, Token: ${response.token}`,
    );

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_REGISTER, {
        id: response.reader.id,
        token: response.token,
      }),
    );
  }

  private async handleAuthentication(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.logger.debug('processing READER_AUTHENTICATE event', data);

    const unauthorizedResponse = new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, {
      message: 'PLEASE_REREGISTER',
    });

    this.logger.debug('Checking if reader exists');
    const reader = await this.attractapService.findReaderById(data.payload.id);
    if (!reader) {
      this.logger.error('No reader-config found for socket, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    this.logger.debug('Checking if token is valid');
    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    socket.readerId = reader.id;

    const authenticatedResponse = new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
      name: reader.name,
    });
    await socket.sendMessage(authenticatedResponse);

    await this.sendResourceList(socket);
  }

  private async sendResourceList(socket: AuthenticatedWebSocket, onlyIfResourceMatches?: { resourceId?: number }) {
    const reader = await this.attractapService.findReaderById(socket.readerId);
    if (!reader) {
      throw new Error(`Reader not found: ${socket.readerId}`);
    }

    const resources = reader.resources;
    if (onlyIfResourceMatches?.resourceId) {
      if (!resources.some((resource) => resource.id === onlyIfResourceMatches.resourceId)) {
        return;
      }
    }

    const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, {
      resources: resources.map(
        (resource) =>
          ({
            id: resource.id,
            name: resource.name,
            type: resource.type,
            separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
            description: resource.description,
            imageFilename: resource.imageFilename,
            allowTakeOver: resource.allowTakeOver,
            introducers: resource.introducers.map(
              (introducer) =>
                ({
                  id: introducer.id,
                  user: {
                    id: introducer.user.id,
                    username: introducer.user.username,
                  } as Partial<User>,
                }) as Partial<ResourceIntroducer>,
            ),
            billingConfigurations: resource.billingConfigurations.map(
              (billingConfiguration) =>
                ({
                  id: billingConfiguration.id,
                  creditsPerUsage: billingConfiguration.creditsPerUsage,
                  creditsPerMinute: billingConfiguration.creditsPerMinute,
                }) as Partial<ResourceBillingConfiguration>,
            ),
          }) as Partial<Resource>,
      ),
    });
    await socket.sendMessage(resourceListResponse);
  }

  public async startEnrollOfNewNfcCard(data: { readerId: number; userId: number }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const socket = Array.from(this.websocketService.sockets.values()).find(
      (socket) => socket.readerId === data.readerId,
    );

    if (!socket) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }

    // TODO: implement this
  }

  public async startResetOfNfcCard(data: { readerId: number; userId: number; cardId: number }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const socket = Array.from(this.websocketService.sockets.values()).find(
      (socket) => socket.readerId === data.readerId,
    );

    if (!socket) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }

    const nfcCard = await this.attractapService.getNFCCardByID(data.cardId);

    if (!nfcCard) {
      throw new Error(`NFC card not found: ${data.cardId}`);
    }

    // TODO: implement this
  }

  public async onResourceUsageChanged(resourceId: number) {
    await Promise.all(
      Array.from(this.websocketService.sockets.values()).map(async (socket) => {
        await this.sendResourceList(socket, { resourceId });
      }),
    );
  }
}
