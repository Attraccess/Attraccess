import { OnEvent } from '@nestjs/event-emitter';
import { Inject, Logger, UseInterceptors } from '@nestjs/common';

import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
} from '@nestjs/websockets';

import { Mutex } from 'async-mutex';

import { Server, WebSocket } from 'ws';

import { LicenseService, LicenseModuleType } from '../../license/license.service';

import { WS_METRICS } from '../../metrics/definitions/tokens';

import { WsMetrics, ATTRACTAP_GATEWAY_LABEL } from '../../metrics/definitions/ws.metrics';

import { WsMetricsInterceptor } from '../../metrics/instrumentation/ws/ws.interceptor';

import { MetricsService } from '../../metrics/metrics.service';

import { MetricsToggleService } from '../../metrics/settings/metrics-toggle.service';

import { AttractapService } from '../attractap.service';

import { AttractapAuthHandler } from './handlers/auth/auth.handler';

import { AttractapBillingHandler } from './handlers/billing/billing.handler';

import { AttractapCardHandler } from './handlers/card/card.handler';

import { AttractapCrashReportHandler } from './handlers/crash-report/crash-report.handler';

import { AttractapFirmwareHandler } from './handlers/firmware/firmware.handler';

import { AttractapFormsHandler } from './handlers/forms/forms.handler';

import { AttractapProjectsHandler } from './handlers/projects/projects.handler';

import { ResourceListService } from './handlers/resource-list/resource-list.service';

import { AttractapSessionHandler } from './handlers/session/session.handler';

import { AttractapSupervisionHandler } from './handlers/supervision/supervision.handler';

import { WebsocketService } from './websocket.service';

import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket, AttractapMessage } from './websocket.types';

import { randomBytes } from 'crypto';

import { closeSync } from 'fs';

@WebSocketGateway({ path: '/api/attractap/websocket' })
@UseInterceptors(WsMetricsInterceptor)
export class AttractapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  protected readonly logger = new Logger(AttractapGateway.name);

  protected readonly clientResponseAwaitersMutex = new Mutex();

  @Inject(WebsocketService)
  protected websocketService: WebsocketService;

  @Inject(AttractapService)
  protected attractapService: AttractapService;

  @Inject(LicenseService)
  protected licenseService: LicenseService;

  @Inject(MetricsService)
  protected metricsService: MetricsService;

  @Inject(WS_METRICS)
  protected wsMetrics: WsMetrics;

  @Inject(MetricsToggleService)
  protected metricsToggle: MetricsToggleService;

  @Inject(ResourceListService)
  protected resourceListService: ResourceListService;

  @Inject(AttractapAuthHandler)
  protected authHandler: AttractapAuthHandler;

  @Inject(AttractapFirmwareHandler)
  protected firmwareHandler: AttractapFirmwareHandler;

  @Inject(AttractapCrashReportHandler)
  protected crashReportHandler: AttractapCrashReportHandler;

  @Inject(AttractapCardHandler)
  protected cardHandler: AttractapCardHandler;

  @Inject(AttractapFormsHandler)
  protected formsHandler: AttractapFormsHandler;

  @Inject(AttractapSessionHandler)
  protected sessionHandler: AttractapSessionHandler;

  @Inject(AttractapBillingHandler)
  protected billingHandler: AttractapBillingHandler;

  @Inject(AttractapProjectsHandler)
  protected projectsHandler: AttractapProjectsHandler;

  @Inject(AttractapSupervisionHandler)
  protected supervisionHandler: AttractapSupervisionHandler;

  protected readonly connectedAt = new WeakMap<object, bigint>();

  protected clientResponseAwaiters: Array<{
    id: string;
    clientId: string;
    type: AttractapEventType;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  protected readonly eventHandlers: Record<
    AttractapEventType,
    (socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) => unknown
  > = {
    [AttractapEventType.READER_REGISTER]: (socket, eventData) =>
      this.authHandler.handleReaderRegister(socket, eventData),
    [AttractapEventType.READER_AUTHENTICATE]: (socket, eventData) =>
      this.authHandler.handleAuthentication(socket, eventData),
    [AttractapEventType.READER_FIRMWARE_INFO]: (socket, eventData) =>
      this.firmwareHandler.handleFirmwareInfo(socket, eventData),
    [AttractapEventType.READER_CRASH_REPORT]: (socket, eventData) =>
      this.crashReportHandler.handleCrashReport(socket, eventData),
    [AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      this.cardHandler.handleCardAuthenticationRequest(socket, eventData),
    [AttractapEventType.SUPERVISION_REQUEST]: (socket, eventData) =>
      this.supervisionHandler.handleSupervisionRequest(socket, eventData),
    [AttractapEventType.REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      this.supervisionHandler.handleSupervisorCardAuthRequest(socket, eventData),
    [AttractapEventType.SUPERVISOR_CARD_AUTH_CONFIRMED]: (socket, eventData) =>
      this.supervisionHandler.handleSupervisorCardAuthConfirmed(socket, eventData),
    [AttractapEventType.SUPERVISION_CANCEL]: (socket) => this.supervisionHandler.handleSupervisionCancel(socket),
    [AttractapEventType.START_RESOURCE_USAGE_SESSION]: (socket, eventData) =>
      this.sessionHandler.handleStartResourceUsageSession(socket, eventData),
    [AttractapEventType.STOP_RESOURCE_USAGE_SESSION]: (socket, eventData) =>
      this.sessionHandler.handleStopResourceUsageSession(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_STATS]: (socket, eventData) =>
      this.sessionHandler.handleResourceUsageStats(socket, eventData),
    [AttractapEventType.LOCK_DOOR]: (socket, eventData) => this.sessionHandler.handleLockDoor(socket, eventData),
    [AttractapEventType.UNLOCK_DOOR]: (socket, eventData) => this.sessionHandler.handleUnlockDoor(socket, eventData),
    [AttractapEventType.UNLATCH_DOOR]: (socket, eventData) => this.sessionHandler.handleUnlatchDoor(socket, eventData),
    [AttractapEventType.TRIGGER_FLOW_BUTTON]: (socket, eventData) =>
      this.sessionHandler.handleTriggerFlowButton(socket, eventData),
    [AttractapEventType.BILLING_REQUEST_TOPUP]: (socket, eventData) =>
      this.billingHandler.handleBillingRequestTopup(socket, eventData),
    [AttractapEventType.FIRMWARE_REQUEST_CHUNK]: (socket, eventData) =>
      this.firmwareHandler.handleFirmwareChunkRequest(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY]: (socket, eventData) =>
      this.cardHandler.onEnrollNewCardRequestNFCKey(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD]: (socket, eventData) => this.cardHandler.onEnrollNewCard(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD_CANCEL]: (socket) => this.cardHandler.onEnrollNewCardCancel(socket),
    [AttractapEventType.RESET_NFC_CARD]: (socket, eventData) => this.cardHandler.onResetNfcCard(socket, eventData),
    [AttractapEventType.RESET_NFC_CARD_CANCEL]: (socket) => this.cardHandler.onResetNfcCardCancel(socket),
    [AttractapEventType.PROJECTS_OF_USER]: (socket, eventData) =>
      this.projectsHandler.handleProjectsOfUserRequest(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_GET_FIELDS]: (socket, eventData) =>
      this.formsHandler.handleResourceUsageFormGetFields(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_SUBMIT_PAGE]: (socket, eventData) =>
      this.formsHandler.handleResourceUsageFormSubmitPage(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_CANCEL]: (socket, eventData) => {
      this.formsHandler.handleResourceUsageFormCancel(socket, eventData);
    },
    [AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED]: () => undefined,
    [AttractapEventType.REQUEST_RESOURCE_LIST]: (socket, eventData) =>
      this.resourceListService.sendResourceListToSocket(socket, { requestId: eventData.payload?.requestId }),
    [AttractapEventType.RESOURCE_LIST]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_UNAUTHORIZED]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_REQUEST_AUTHENTICATION]: (socket, eventData) =>
      this.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_AUTHENTICATED]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_LANGUAGE]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.CARD_AUTHENTICATION_DATA]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      this.rejectServerEvent(socket, eventData),
    [AttractapEventType.SUPERVISION_RESOLVED]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.SUPERVISION_START]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO]: (socket, eventData) =>
      this.rejectServerEvent(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_REQUEST]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_FIELDS]: (socket, eventData) => this.rejectServerEvent(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT]: (socket, eventData) =>
      this.rejectServerEvent(socket, eventData),
  };

  public async sendResourceList(readerId: number) {
    return this.resourceListService.sendResourceList(readerId);
  }

  @OnEvent('settings.default-language')
  async updateReaderLanguage(language: 'en' | 'de') {
    this.websocketService.readerLanguage = language;
    const readers = Array.from(this.websocketService.sockets.values()).filter(
      (socket) => typeof socket.readerId === 'number' && socket.readerId > 0 && socket.readyState === WebSocket.OPEN,
    );
    await Promise.all(
      readers.map((socket) => socket.sendMessage(new AttractapEvent(AttractapEventType.READER_LANGUAGE, { language }))),
    );
  }

  public async sendResourceListToReadersWithResources(resourceIds: number[]) {
    return this.resourceListService.sendResourceListToReadersWithResources(resourceIds);
  }

  public async disconnectReader(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      return;
    }

    await Promise.all(sockets.map((socket) => socket.close()));
  }

  public async startEnrollOfNewNfcCard(data: {
    readerId: number;
    userId: number;
    actorId?: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    return this.cardHandler.startEnrollOfNewNfcCard(data);
  }

  public async startResetOfNfcCard(data: {
    readerId: number;
    userId: number;
    cardId: number;
    authenticationMethod?: 'session' | 'api-token';
    apiTokenId?: number;
  }) {
    return this.cardHandler.startResetOfNfcCard(data);
  }

  protected makeStringLVGLReady(input: string): string {
    if (!input) return input;

    // Step 1: Explicit replacements for unsupported punctuation and symbols
    const explicitReplacements: Array<[RegExp, string]> = [
      // Common symbols and punctuation
      [/\u2018|\u2019|\u201A|\u2032/g, "'"], // smart single quotes, prime
      [/\u201C|\u201D|\u201E|\u2033/g, '"'], // smart double quotes, double prime
      [/\u2013|\u2014|\u2015/g, '-'], // en/em/horizontal bar -> hyphen
      [/\u2026/g, '...'], // ellipsis
      [/\u2022/g, '-'], // bullet -> hyphen
      [/\u2122/g, 'TM'], // trademark
    ];

    let output = input;
    for (const [pattern, replacement] of explicitReplacements) {
      output = output.replace(pattern, replacement);
    }

    // The reader's Latin-1 fonts cover printable ASCII plus U+00A0-U+00FF.
    // Normalize only unsupported code points so existing Latin-1 glyphs survive.
    return Array.from(output)
      .map((character) => {
        if (/^[\n\r\t\x20-\x7E\xA0-\xFF]$/.test(character)) {
          return character;
        }

        const fallback = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return /^[\x20-\x7E]*$/.test(fallback) ? fallback : '?';
      })
      .join('');
  }

  protected sanitizeForLVGL<T>(value: T): T {
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
          // Select options and draft values are protocol values: changing them
          // prevents the firmware from submitting the value the API validates.
          // Object-based options contain display metadata such as placeholders.
          out[k] = (k === 'options' && Array.isArray(val)) || k === 'value' || k === 'answers' ? val : sanitize(val);
        }
        return out;
      }
      return v;
    };

    return sanitize(value) as T;
  }

  protected async waitForClientResponse(client: AuthenticatedWebSocket, type: AttractapEventType, timeoutMs = 4000) {
    const id = randomBytes(4).toString('base64url').slice(0, 5);

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

  protected async resolveClientResponseAwaiters(client: AuthenticatedWebSocket, type: AttractapEventType) {
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

      // Only remove the awaiters we just resolved, not all awaiters for this client.
      // Previously we removed all client awaiters, which could prematurely clear
      // awaiters for other in-flight messages (e.g. ACK_RESOURCE_LIST clearing
      // READER_FIRMWARE_UPDATE_REQUIRED awaiter before its ACK arrived).
      const resolvedIds = new Set(matchingAwaiters.map((a) => a.id));
      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => !resolvedIds.has(awaiter.id));
    });
  }

  @SubscribeMessage('HEARTBEAT')
  public async onHeartbeat(@ConnectedSocket() socket: AuthenticatedWebSocket) {
    this.logger.debug(`Heartbeat from client ${socket.id}.`);

    try {
      (socket as unknown as { send: (data: string) => void }).send(JSON.stringify({ event: 'HEARTBEAT' }));
    } catch (error) {
      this.logger.error(`Failed to send heartbeat ack to client ${socket.id}: ${(error as Error).message}`);
    }

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

    if (!Object.hasOwn(this.eventHandlers, eventData.type)) throw new Error(`Unknown event type: ${eventData.type}`);
    await this.eventHandlers[eventData.type](socket, eventData);
  }

  protected rejectServerEvent(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']): never {
    this.logger.error(
      `Received event of type ${eventData.type} from client ${socket.id}, this is a server side only event, clients should not send this event`,
    );
    throw new Error('THIS IS A SERVER SIDE ONLY EVENT, CLIENTS SHOULD NOT SEND THIS EVENT');
  }

  public async handleConnection(client: WebSocket) {
    this.connectedAt.set(client as unknown as object, process.hrtime.bigint());
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

    const id = randomBytes(4).toString('base64url').slice(0, 5);
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
        // An older auth/update retry must not restore a superseded default.
        if (
          (message.data.type === AttractapEventType.READER_AUTHENTICATED ||
            message.data.type === AttractapEventType.READER_LANGUAGE) &&
          this.websocketService.readerLanguage !== undefined
        ) {
          message.data.payload.language = this.websocketService.readerLanguage;
        }
        const stringifiedMessage = JSON.stringify(this.sanitizeForLVGL(message));
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
          `Client did not send ACK for ${message.data.type} after ${RETRY_COUNT} attempts. Won't try again.`,
        );
        return false;
      }

      return true;
    };

    const sendBinaryData = (data: Buffer) => {
      try {
        client.send(data as unknown as BufferSource);
      } catch (e) {
        this.logger.error(`Failed to send binary data to client ${id}: ${(e as Error).message}`);
      }
    };

    Object.assign(client, {
      id,
      messageCount,
      readerId: null,
      readerName: null,
      sendMessage,
      sendBinaryData,
      state: {
        lastAuthenticatedUserId: null,
        enrollment: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        ota: null,
        supervisionFlow: null,
      },
    });

    this.websocketService.sockets.set(id, client as unknown as AuthenticatedWebSocket);
    this.metricsService.attractapDevicesConnected.set(this.websocketService.sockets.size);

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

  public async handleDisconnect(socket: AuthenticatedWebSocket) {
    const connectedAt = this.connectedAt.get(socket as unknown as object);
    this.connectedAt.delete(socket as unknown as object);
    if (connectedAt !== undefined && this.metricsToggle.isEnabledCached('ws')) {
      const seconds = Number(process.hrtime.bigint() - connectedAt) / 1e9;
      this.wsMetrics.connectionDuration.observe({ gateway: ATTRACTAP_GATEWAY_LABEL }, seconds);
    }

    this.logger.debug(`Client ${socket.id} disconnected.`);

    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.clientId !== socket.id);
    });

    const readerId = socket.readerId;
    const readerName = socket.readerName;
    if (readerId) {
      this.logger.log(`Client for reader ${readerId} disconnected.`);
      // ponytail: only zero gauge when no other socket for this reader exists —
      // prevents a stale-socket disconnect from marking a reconnected reader offline.
      const hasOtherSocket = Array.from(this.websocketService.sockets.values()).some(
        (other) => other.id !== socket.id && other.readerId === readerId,
      );
      if (!hasOtherSocket) {
        this.metricsService.attractapReaderConnected.set(
          { reader_id: String(readerId), reader_name: readerName ?? '' },
          0,
        );
      }
    } else {
      this.logger.log('An unidentified client disconnected.');
    }

    // Tear down any in-progress two-card supervision so the supervisor's web popup doesn't linger.
    if (socket.state?.supervisionFlow) {
      this.supervisionHandler.cancelForSocket(socket);
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
    this.metricsService.attractapDevicesConnected.set(this.websocketService.sockets.size);
  }

  protected async clientWasActive(socket: AuthenticatedWebSocket) {
    if (socket.readerId) {
      await this.attractapService.updateLastReaderConnection(socket.readerId);
    }
  }
}
