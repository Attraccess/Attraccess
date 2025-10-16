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
import { ResourceImageService } from '../../resources/resourceImage.service';
import sharp from 'sharp';
import { ResourceUsageService } from '../../resources/usage/resourceUsage.service';
import { ResourcesService } from '../../resources/resources.service';

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

  @Inject(ResourceImageService)
  private resourceImageService: ResourceImageService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

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

  public async handleConnection(client: WebSocket) {
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

    const id = nanoid(5);

    const sendMessage = async (message: AttractapMessage) => {
      const RETRY_COUNT = 3;

      let lastError: Error | undefined;

      for (let i = 0; i < RETRY_COUNT; i++) {
        this.logger.debug(
          `Sending ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
          message.data.payload,
        );
        const sanitized = this.sanitizeForLVGL(message);
        const stringifiedMessage = JSON.stringify(sanitized);
        client.send(stringifiedMessage);

        this.logger.debug(
          `Waiting for response for ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
        );
        try {
          await this.waitForClientResponse(client as unknown as AuthenticatedWebSocket, message.data.type);
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
        try {
          client.close();
        } catch {
          // ignore error
        }
        return;
      }
    };

    const sendBinaryData = (data: Buffer) => {
      this.logger.verbose(`Sending binary data: ${data.length} bytes`);
      client.send(data);
    };

    Object.assign(client, {
      id,
      readerId: null,
      sendMessage,
      sendBinaryData,
      state: {
        lastAuthenticatedUserId: null,
      },
    });

    this.websocketService.sockets.set(id, client as unknown as AuthenticatedWebSocket);

    await this.clientWasActive(client as unknown as AuthenticatedWebSocket);

    this.logger.debug('Sending authentication request');
    try {
      await sendMessage(new AttractapEvent(AttractapEventType.READER_REQUEST_AUTHENTICATION, {}));
    } catch (error) {
      this.logger.error(`Initial authentication request failed for client ${id}. Closing connection.`);
      this.logger.error(error as Error);
      try {
        client.close();
      } catch {
        // ignore error
      }
      return;
    }
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
      case AttractapEventType.REQUEST_RESOURCE_THUMBNAIL:
        await this.handleResourceThumbnailRequest(socket, eventData);
        break;
      case AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA:
        await this.handleCardAuthenticationRequest(socket, eventData);
        break;
      case AttractapEventType.START_RESOURCE_USAGE_SESSION:
        await this.handleStartResourceUsageSession(socket, eventData);
        break;
      case AttractapEventType.STOP_RESOURCE_USAGE_SESSION:
        await this.handleStopResourceUsageSession(socket, eventData);
        break;
      case AttractapEventType.LOCK_DOOR:
        await this.handleLockDoor(socket, eventData);
        break;
      case AttractapEventType.UNLOCK_DOOR:
        await this.handleUnlockDoor(socket, eventData);
        break;
      case AttractapEventType.UNLATCH_DOOR:
        await this.handleUnlatchDoor(socket, eventData);
        break;
      case AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY:
        await this.onEnrollNewCardRequestNFCKey(socket, eventData);
        break;

      case AttractapEventType.ENROLL_NEW_CARD:
        await this.onEnrollNewCard(socket, eventData);
        break;

      case AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED:
      case AttractapEventType.READER_FIRMWARE_STREAM_CHUNK:
        // TODO: implement firmware updates
        break;
      case AttractapEventType.RESOURCE_LIST:
      case AttractapEventType.READER_UNAUTHORIZED:
      case AttractapEventType.READER_REQUEST_AUTHENTICATION:
      case AttractapEventType.READER_AUTHENTICATED:
      case AttractapEventType.CARD_AUTHENTICATION_DATA:
      case AttractapEventType.RESOURCE_THUMBNAIL_DATA:
      case AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO:
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

  private clampSize(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private async handleResourceThumbnailRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const reader = await this.attractapService.findReaderById(socket.readerId);
    if (!reader) {
      throw new Error(`Reader not found: ${socket.readerId}`);
    }

    const { resourceId, width, height, format } = data.payload as {
      resourceId: number;
      width: number;
      height: number;
      format?: 'RGB565LE';
    };

    if (!resourceId || !width || !height) {
      this.logger.warn('Invalid thumbnail request payload');
      return;
    }

    // Verify that the resource belongs to the reader
    const resource = reader.resources.find((resource) => resource.id === resourceId);
    if (!resource) {
      this.logger.warn(`Reader ${reader.id} requested thumbnail for non-associated resource ${resourceId}`);
      return;
    }

    if (!resource) {
      this.logger.warn(`Resource ${resourceId} has no image`);
      return;
    }

    const w = this.clampSize(width, 8, 128);
    const h = this.clampSize(height, 8, 128);

    try {
      const imagePath = await this.resourceImageService.getImagePath(resource.id, resource.imageFilename);

      const { data: rawBuffer, info } = await sharp(imagePath)
        .resize({ width: w, height: h, fit: 'cover', position: 'centre' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Convert RGB to RGB565LE format for LVGL compatibility
      const rgb565Buffer = Buffer.alloc(info.width * info.height * 2);
      let bufferIndex = 0;

      for (let i = 0; i < rawBuffer.length; i += 3) {
        const r = rawBuffer[i];
        const g = rawBuffer[i + 1];
        const b = rawBuffer[i + 2];

        // Convert 8-bit RGB to 5-6-5 format
        const r5 = (r >> 3) & 0x1f;
        const g6 = (g >> 2) & 0x3f;
        const b5 = (b >> 3) & 0x1f;

        // Pack into 16-bit value (RGB565)
        const rgb565 = (r5 << 11) | (g6 << 5) | b5;

        // Write as little-endian
        rgb565Buffer[bufferIndex++] = rgb565 & 0xff;
        rgb565Buffer[bufferIndex++] = (rgb565 >> 8) & 0xff;
      }

      const transferId = nanoid(6);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.RESOURCE_THUMBNAIL_DATA, {
          transferId,
          resourceId,
          width: info.width,
          height: info.height,
          format: 'RGB565LE',
          contentLength: rgb565Buffer.length,
        }),
      );

      // log buffer for debug
      this.logger.debug(`Sending ${rgb565Buffer.length} bytes of RGB565LE data`);
      this.logger.debug(rgb565Buffer.toString('hex'));

      socket.sendBinaryData(rgb565Buffer);
    } catch (error) {
      this.logger.error(`Error preparing thumbnail for resource ${resourceId}: ${String(error)}`);
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

    await this.sendResourceListToSocket(socket);
  }

  public async sendResourceList(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    await Promise.all(sockets.map((socket) => this.sendResourceListToSocket(socket)));
  }

  public async sendResourceListToReadersWithResource(resourceId: number) {
    const allSockets = Array.from(this.websocketService.sockets.values());
    await Promise.all(allSockets.map((socket) => this.sendResourceListToSocket(socket, { resourceId })));
  }

  private async sendResourceListToSocket(
    socket: AuthenticatedWebSocket,
    onlyIfResourceMatches?: { resourceId?: number },
  ) {
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

    const resourcesWithUsageSession = await Promise.all(
      resources.map(async (resource) => ({
        ...resource,
        activeUsageSession: await this.resourceUsageService.getActiveSession(resource.id),
      })),
    );

    const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, {
      resources: resourcesWithUsageSession.map(
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
            activeUsageSession: resource.activeUsageSession
              ? {
                  user: {
                    id: resource.activeUsageSession.user.id,
                    username: resource.activeUsageSession.user.username,
                  },
                  startTime: resource.activeUsageSession.startTime.toISOString(),
                }
              : null,
          }) as Partial<Resource>,
      ),
    });
    this.logger.debug(`Sending resource list to socket ${socket.id}`, resourceListResponse);
    await socket.sendMessage(resourceListResponse);
  }

  public async disconnectReader(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    await Promise.all(sockets.map((socket) => socket.close()));
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

    const sockets = Array.from(this.websocketService.sockets.values()).filter(
      (socket) => socket.readerId === data.readerId,
    );

    if (sockets.length === 0) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }

    // Send to all active sockets for this reader to avoid targeting a stale/disconnecting socket
    const tasks = sockets.map(async (socket) => {
      socket.state.lastAuthenticatedUserId = user.id;
      try {
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO, {
            username: user.username,
          }),
        );
      } catch (error) {
        // Log and continue; other sockets may still deliver the event
        this.logger.debug(
          `Failed to send ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO to client ${socket.id}: ${String(error)}`,
        );
      }
    });

    await Promise.allSettled(tasks);
  }

  private async onEnrollNewCardRequestNFCKey(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, keyNo } = data.payload as { uid: string; keyNo: number };

    if (!socket.state.lastAuthenticatedUserId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'USER_NOT_SET' }),
      );
      return;
    }

    if (!uid || typeof uid !== 'string' || !keyNo || typeof keyNo !== 'number') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'INVALID_PARAMS' }),
      );
      return;
    }

    const key = await this.attractapService.generateNTAG424Key({
      userId: socket.state.lastAuthenticatedUserId,
      keyNo,
      cardUID: uid,
    });

    const keyString = this.attractapService.uint8ArrayToHexString(key);

    socket.state.enrollNewCardData = {
      keyNo,
      key: keyString,
      cardUID: uid,
    };
    await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { key: keyString, keyNo }));
  }

  private async onEnrollNewCard(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!socket.state.enrollNewCardData) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'ENROLL_NEW_CARD_DATA_NOT_SET' }),
      );
      return;
    }

    const { success } = data.payload as { success: boolean };
    if (!success) {
      this.logger.error('Enroll new card failed');
      return;
    }

    const { key, keyNo, cardUID } = socket.state.enrollNewCardData;

    if (!key || typeof key !== 'string' || !keyNo || typeof keyNo !== 'number') {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'KEY_NOT_SET' }));
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { error: 'USER_NOT_FOUND' }));
      return;
    }

    await this.attractapService.createNFCCard(user, {
      key,
      keyNo,
      uid: cardUID,
    });

    socket.state.enrollNewCardData = null;
    socket.state.lastAuthenticatedUserId = null;
    socket.sendMessage(new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD, { success: true }));
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

  private async handleCardAuthenticationRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid } = data.payload as { uid: string };

    if (!uid || typeof uid !== 'string') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
          error: 'INVALID_UID',
        }),
      );
      return;
    }

    const nfcCard = await this.attractapService.getNFCCardByUID(uid);

    if (!nfcCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
          error: 'CARD_NOT_FOUND',
        }),
      );
      return;
    }

    socket.state.lastAuthenticatedUserId = nfcCard.user.id;
    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
        keyNo: nfcCard.keyNo,
        key: nfcCard.key,
      }),
    );
  }

  private async validateResourceAction(
    socket: AuthenticatedWebSocket,
    resourceId: number,
    eventType: AttractapEventType,
  ): Promise<boolean> {
    if (!resourceId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'INVALID_RESOURCE_ID' }),
      );
      return false;
    }

    const reader = await this.attractapService.findReaderById(socket.readerId);
    if (!reader) {
      await socket.sendMessage(new AttractapEvent(eventType, { error: 'READER_NOT_FOUND' }));
      return false;
    }

    const resource = reader.resources.find((resource) => resource.id === resourceId);
    if (!resource) {
      await socket.sendMessage(
        new AttractapEvent(eventType, {
          error: 'RESOURCE_NOT_ASSOCIATED_WITH_READER',
        }),
      );
      return false;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(new AttractapEvent(eventType, { error: 'USER_NOT_FOUND' }));
      return false;
    }

    return true;
  }

  private async handleStartResourceUsageSession(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    await this.resourceUsageService.startSession(resourceId, user, {});
  }

  private async handleStopResourceUsageSession(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    await this.resourceUsageService.endSession(resourceId, user, {});
  }

  private async handleLockDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    await this.resourceUsageService.lockDoor(resourceId, user);
  }

  private async handleUnlockDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    await this.resourceUsageService.unlockDoor(resourceId, user);
  }

  private async handleUnlatchDoor(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    await this.resourceUsageService.unlatchDoor(resourceId, user);
  }
}
