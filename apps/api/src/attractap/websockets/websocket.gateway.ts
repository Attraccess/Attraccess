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
import { existsSync, statSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { Inject, Logger } from '@nestjs/common';
import { WebsocketService } from './websocket.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapMessage, AttractapEventType } from './websocket.types';
import { AttractapService } from '../attractap.service';
import { nanoid } from 'nanoid';
import { UsersService } from '../../users-and-auth/users/users.service';
import { AttractapFirmwareService } from '../firmware.service';
import { SumUpService } from '../../billing/sumup.service';
import { Mutex } from 'async-mutex';
import { LicenseModuleType, LicenseService } from '../../license/license.service';
import { AttractapFirmware } from '../dtos/firmware.dto';
import { verifyToken } from './websocket.utils';
import { ResourceUsageService } from '../../resources/usage/resourceUsage.service';
import { ResourceIntroductionsService } from '../../resources/introductions/resouceIntroductions.service';
import { ResourceIntroducersService } from '../../resources/introducers/resourceIntroducers.service';
import { ResourceFlowsService } from '../../resources/flows/resource-flows.service';
import { ResourceFlowsExecutorService } from '../../resources/flows/resource-flows-executor.service';
import { ResourceInUseError } from '../../resources/usage/errors/resource-in-use.error';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';
import { FlowExecutionError } from '../../resources/flows/errors/flow-execution.error';
import { ResourceFlowNodeType, ResourceFormAction } from '@attraccess/database-entities';
import { ProjectsService } from '../../projects/projects.service';
import { ResourceFormsService } from '../../resources/forms/forms.service';
import { FormSubmissionRequestDto } from '../../resources/forms/dto/form-submission-request.dto';
import { ResourceUsageFormRequestPayload } from './websocket.types';

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

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(ResourceIntroductionsService)
  private resourceIntroductionService: ResourceIntroductionsService;

  @Inject(ResourceIntroducersService)
  private resourceIntroducersService: ResourceIntroducersService;

  @Inject(ResourceFlowsService)
  private resourceFlowsService: ResourceFlowsService;

  @Inject(ResourceFlowsExecutorService)
  private resourceFlowsExecutorService: ResourceFlowsExecutorService;

  @Inject(SumUpService)
  private sumUpService: SumUpService;

  @Inject(ProjectsService)
  private projectsService: ProjectsService;

  @Inject(ResourceFormsService)
  private resourceFormsService: ResourceFormsService;

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
    let messageCount = 0;

    const sendMessage = async (message: AttractapMessage) => {
      messageCount++;
      message.data.messageId = messageCount;

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
      try {
        client.send(data);
      } catch (e) {
        this.logger.error(`Failed to send binary data to client ${id}: ${(e as Error).message}`);
      }
    };

    Object.assign(client, {
      id,
      messageCount,
      readerId: null,
      sendMessage,
      sendBinaryData,
      state: {
        lastAuthenticatedUserId: null,
        enrollNewCardData: null,
        ota: null,
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

    // Clean up OTA file descriptor if present
    if (socket.state?.ota?.fd) {
      try {
        closeSync(socket.state.ota.fd);
      } catch {
        // nothing to do
      }
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
      case AttractapEventType.TRIGGER_FLOW_BUTTON:
        await this.handleTriggerFlowButton(socket, eventData);
        break;
      case AttractapEventType.BILLING_REQUEST_TOPUP:
        await this.handleBillingRequestTopup(socket, eventData);
        break;
      case AttractapEventType.FIRMWARE_REQUEST_CHUNK:
        await this.handleFirmwareChunkRequest(socket, eventData);
        break;
      case AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY:
        await this.onEnrollNewCardRequestNFCKey(socket, eventData);
        break;

      case AttractapEventType.ENROLL_NEW_CARD:
        await this.onEnrollNewCard(socket, eventData);
        break;

      case AttractapEventType.PROJECTS_OF_USER:
        await this.handleProjectsOfUserRequest(socket, eventData);
        break;

      case AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED:
        // no-op on server; metadata-only event sent by server
        break;
      case AttractapEventType.RESOURCE_LIST:
      case AttractapEventType.READER_UNAUTHORIZED:
      case AttractapEventType.READER_REQUEST_AUTHENTICATION:
      case AttractapEventType.READER_AUTHENTICATED:
      case AttractapEventType.CARD_AUTHENTICATION_DATA:
      case AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO:
      case AttractapEventType.RESOURCE_USAGE_FORM_REQUEST:
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

  private async handleFirmwareChunkRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    try {
      if (!socket.state.ota || !socket.state.ota.path || !socket.state.ota.size) {
        this.logger.error(`FIRMWARE_REQUEST_CHUNK received but no OTA context set for client ${socket.id}`);
        return;
      }

      const { offset, length } = data.payload;
      const total = socket.state.ota.size;
      if (typeof offset !== 'number' || typeof length !== 'number' || offset < 0 || length <= 0 || offset >= total) {
        this.logger.error(`Invalid chunk request from client ${socket.id}: offset=${offset} length=${length}`);
        return;
      }

      const maxChunk = 4096; // hard cap chunk size
      const safeLen = Math.min(length, maxChunk, total - offset);

      // Lazily open file descriptor
      if (!socket.state.ota.fd) {
        try {
          socket.state.ota.fd = openSync(socket.state.ota.path, 'r');
        } catch (e) {
          this.logger.error(`Failed to open firmware for client ${socket.id}: ${(e as Error).message}`);
          return;
        }
      }

      const fd = socket.state.ota.fd as number;
      const buffer = Buffer.allocUnsafe(safeLen);
      let bytesRead = 0;
      try {
        bytesRead = readSync(fd, buffer, 0, safeLen, offset);
      } catch (e) {
        this.logger.error(`Failed to read firmware chunk for client ${socket.id}: ${(e as Error).message}`);
        return;
      }

      if (bytesRead > 0) {
        socket.sendBinaryData(buffer.subarray(0, bytesRead));
      }
    } catch (err) {
      this.logger.error(`handleFirmwareChunkRequest error: ${(err as Error).message}`);
    }
  }

  private async handleFirmwareInfo(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    await this.attractapService.updateReaderFirmware(socket.readerId, data.payload);

    const firmwareIsUpToDate = await this.isFirmwareLatest(data.payload);
    if (!firmwareIsUpToDate) {
      this.logger.debug('Firmware is not up to date, notifying client to start OTA');

      try {
        const current = data.payload as AttractapFirmware;
        const latest = await this.firmwareService.getFirmwareDefinition(current.name, current.variant);
        if (!latest) {
          this.logger.warn(
            `No firmware definition found for ${current.name}/${current.variant}; treating as up-to-date for now.`,
          );
          return;
        }

        const assetsDir = join(__dirname, 'assets', 'attractap-firmwares');
        const otaFilename = latest.filenameOTA || latest.filename;
        const firmwarePath = join(assetsDir, otaFilename);
        if (!existsSync(firmwarePath)) {
          this.logger.error(`OTA firmware binary not found at ${firmwarePath}`);
          return;
        }
        const size = statSync(firmwarePath).size;
        if (!size || size < 1024) {
          this.logger.error(`OTA firmware size is suspicious (${size} bytes) for ${otaFilename}`);
          return;
        }

        // Store OTA context for this socket
        socket.state.ota = { path: firmwarePath, size } as AuthenticatedWebSocket['state']['ota'];

        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {
            available: {
              name: latest.name,
              variant: latest.variant,
              version: String(latest.version),
              totalSize: size,
            },
          }),
        );
      } catch (err) {
        this.logger.error(`Failed to prepare firmware update notice: ${(err as Error).message}`);
      }
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
        activeUsageSession: await this.resourceUsageService.getActiveSession(resource.id, true),
      })),
    );

    const getFlowButtons = async (resourceId: number) => {
      const nodes = await this.resourceFlowsService.getNodes(resourceId, ResourceFlowNodeType.INPUT_BUTTON);
      return nodes.map((node) => ({
        id: node.id,
        label: node.data.label || node.id,
      }));
    };

    const resourcesWithFlowButtons = await Promise.all(
      resourcesWithUsageSession.map(async (resource) => ({
        ...resource,
        flowButtons: await getFlowButtons(resource.id),
      })),
    );

    const resourceListResponse = new AttractapEvent(AttractapEventType.RESOURCE_LIST, {
      readerName: reader.name,
      resources: resourcesWithFlowButtons.map((resource) => ({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        separateUnlockAndUnlatch: resource.separateUnlockAndUnlatch,
        description: resource.description,
        allowTakeOver: resource.allowTakeOver,
        introducers: resource.introducers.map((introducer) => introducer.user.username),
        activeUsageSession: resource.activeUsageSession
          ? {
              user: {
                username: resource.activeUsageSession.user.username,
              },
              startTime: resource.activeUsageSession.startTime.toISOString(),
            }
          : null,
        flowButtons: resource.flowButtons,
      })),
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

    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new Error(`Reader does not support card enrollment: ${data.readerId}`);
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

    const existingCard = await this.attractapService.getNFCCardByUID(uid);
    if (existingCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY, { error: 'CARD_ALREADY_ENROLLED' }),
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
    const { uid, resourceId } = data.payload as { uid: string; resourceId: number };

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

    if (!nfcCard.isActive) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
          error: 'CARD_NOT_ACTIVE',
        }),
      );
      return;
    }

    socket.state.lastAuthenticatedUserId = nfcCard.user.id;

    const hasIntroduction = await this.resourceUsageService.canControllResource(resourceId, nfcCard.user);
    const isIntroducer = await this.resourceIntroducersService.isIntroducer(resourceId, nfcCard.user.id, true);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.CARD_AUTHENTICATION_DATA, {
        keyNo: nfcCard.keyNo,
        key: nfcCard.key,
        username: nfcCard.user.username,
        canManageResource: nfcCard.user.systemPermissions.canManageResources,
        hasIntroduction,
        isIntroducer,
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

  private async ensureFormsSatisfied({
    socket,
    resourceId,
    action,
    formSubmissions,
  }: {
    socket: AuthenticatedWebSocket;
    resourceId: number;
    action: ResourceFormAction;
    formSubmissions?: FormSubmissionRequestDto[];
  }): Promise<boolean> {
    const forms = await this.resourceFormsService.getFormsForAction(resourceId, action);
    if (!forms.length) {
      return true;
    }

    const submissionIds = new Set((formSubmissions ?? []).map((submission) => submission.formId));
    const allProvided = forms.every((form) => submissionIds.has(form.id));
    if (allProvided) {
      return true;
    }

    let resourceName: string | undefined;
    try {
      const reader = socket.readerId ? await this.attractapService.findReaderById(socket.readerId) : null;
      const resource = reader?.resources?.find((item) => item.id === resourceId);
      resourceName = resource?.name;
    } catch (error) {
      this.logger.debug(`Failed to resolve resource name for form request: ${(error as Error).message}`);
    }

    const payload: ResourceUsageFormRequestPayload = {
      resourceId,
      resourceName,
      action,
      forms: forms.map((form) => ({
        id: form.id,
        name: form.name,
        fields: form.fields.map((field) => ({
          id: field.id,
          name: field.name,
          description: field.description ?? null,
          type: field.type,
          isRequired: field.isRequired,
          options: field.options ?? null,
        })),
      })),
    };

    await socket.sendMessage(new AttractapEvent(AttractapEventType.RESOURCE_USAGE_FORM_REQUEST, payload));
    return false;
  }

  private async handleStartResourceUsageSession(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, projectId, formSubmissions } = data.payload as {
      resourceId: number;
      projectId?: number;
      formSubmissions?: FormSubmissionRequestDto[];
    };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    if (
      !(await this.ensureFormsSatisfied({
        socket,
        resourceId,
        action: ResourceFormAction.START,
        formSubmissions,
      }))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    try {
      await this.resourceUsageService.startSession(resourceId, user, { projectId, formSubmissions });
      await socket.sendMessage(new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { success: true }));
    } catch (error) {
      if (error instanceof ResourceInUseError) {
        setTimeout(async () => {
          await this.sendResourceListToSocket(socket, { resourceId });
        }, 1000);
        return;
      }
      if (error instanceof InsufficientBalanceError || error?.message === 'INSUFFICIENT_BALANCE') {
        const sumUpEnabled = await this.sumUpService.getIsEnabled();
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, {
            error: 'INSUFFICIENT_BALANCE',
            sumUpEnabled,
          }),
        );
        return;
      }
      this.logger.error(`Failed to start resource usage session: ${error.message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: error.message }),
      );
    }
  }

  private async handleStopResourceUsageSession(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, formSubmissions } = data.payload as {
      resourceId: number;
      formSubmissions?: FormSubmissionRequestDto[];
    };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.START_RESOURCE_USAGE_SESSION))) {
      return;
    }

    if (
      !(await this.ensureFormsSatisfied({
        socket,
        resourceId,
        action: ResourceFormAction.END,
        formSubmissions,
      }))
    ) {
      return;
    }

    const user = await this.usersService.findOne({ id: socket.state.lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.START_RESOURCE_USAGE_SESSION, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    try {
      await this.resourceUsageService.endSession(resourceId, user, { formSubmissions });
      await socket.sendMessage(new AttractapEvent(AttractapEventType.STOP_RESOURCE_USAGE_SESSION, { success: true }));
    } catch (error) {
      this.logger.error(`Failed to stop resource usage session: ${error.message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.STOP_RESOURCE_USAGE_SESSION, { error: error.message }),
      );
    }
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

    try {
      await this.resourceUsageService.lockDoor(resourceId, user);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.LOCK_DOOR, { success: true }));
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to lock door: ${errorMessage}`);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.LOCK_DOOR, { error: errorMessage }));
    }
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

    try {
      await this.resourceUsageService.unlockDoor(resourceId, user);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.UNLOCK_DOOR, { success: true }));
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to unlock door: ${errorMessage}`);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.UNLOCK_DOOR, { error: errorMessage }));
    }
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

    try {
      await this.resourceUsageService.unlatchDoor(resourceId, user);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.UNLATCH_DOOR, { success: true }));
    } catch (error) {
      const errorMessage = this.extractUserFacingError(error);
      this.logger.error(`Failed to unlatch door: ${errorMessage}`);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.UNLATCH_DOOR, { error: errorMessage }));
    }
  }

  private async handleTriggerFlowButton(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId, buttonId } = data.payload as { resourceId: number; buttonId: string };

    if (!(await this.validateResourceAction(socket, resourceId, AttractapEventType.TRIGGER_FLOW_BUTTON))) {
      return;
    }

    try {
      await this.resourceFlowsExecutorService.pressButton(resourceId, buttonId, socket.state.lastAuthenticatedUserId);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.TRIGGER_FLOW_BUTTON, { success: true }));
    } catch (error) {
      this.logger.error(`Failed to trigger flow button: ${error.message}`);
      await socket.sendMessage(new AttractapEvent(AttractapEventType.TRIGGER_FLOW_BUTTON, { error: error.message }));
    }
  }

  private async handleBillingRequestTopup(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    try {
      const enabled = await this.sumUpService.getIsEnabled();
      if (!enabled) {
        this.logger.warn('BILLING_REQUEST_TOPUP received but SumUp is not enabled');
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.BILLING_REQUEST_TOPUP, { error: 'SUMUP_NOT_ENABLED' }),
        );
        return;
      }

      const userId = socket.state.lastAuthenticatedUserId;
      if (!userId) {
        this.logger.warn('BILLING_REQUEST_TOPUP received but no authenticated user is set on socket');
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.BILLING_REQUEST_TOPUP, { error: 'USER_NOT_AUTHENTICATED' }),
        );
        return;
      }

      const { amountCents } = data.payload as { amountCents: number };
      if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
        this.logger.warn(`BILLING_REQUEST_TOPUP invalid amount: ${JSON.stringify(data.payload)}`);
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.BILLING_REQUEST_TOPUP, { error: 'INVALID_AMOUNT' }),
        );
        return;
      }

      const readers = await this.sumUpService.getReaders();
      if (!readers || readers.length === 0) {
        this.logger.warn('BILLING_REQUEST_TOPUP requested but no SumUp readers are linked');
        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.BILLING_REQUEST_TOPUP, { error: 'NO_SUMUP_TERMINALS_AVAILABLE' }),
        );
        return;
      }

      // Prefer a paired/active reader if available, otherwise first one
      const preferred = readers.find((r) => r.status === 'paired') || readers[0];
      await this.sumUpService.topUpWithReader(userId, preferred.id, amountCents);
      this.logger.debug(`Started SumUp top-up for user ${userId} on reader ${preferred.id} amount ${amountCents}`);
    } catch (err) {
      this.logger.error(`handleBillingRequestTopup error: ${(err as Error).message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.BILLING_REQUEST_TOPUP, {
          error: 'SUMUP_TOPUP_FAILED',
          details: (err as Error).message,
        }),
      );
    }
  }

  private async handleProjectsOfUserRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const userId = socket.state.lastAuthenticatedUserId;
    if (!userId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { error: 'USER_NOT_AUTHENTICATED' }),
      );
      return;
    }

    const { page = 1, limit = 10 } = data.payload as { page?: number; limit?: number };

    const projects = await this.projectsService.findMany(userId, { page, limit });
    const total = await this.projectsService.getTotalCount(userId);
    await socket.sendMessage(new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { projects, page, limit, total }));
  }

  private extractUserFacingError(error: unknown): string {
    if (error instanceof FlowExecutionError) {
      return error.message.replace(/^FLOW_EXECUTION_ERROR:\s*/, '');
    }
    return error instanceof Error ? error.message : String(error);
  }
}
