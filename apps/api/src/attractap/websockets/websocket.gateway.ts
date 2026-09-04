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
import { closeSync } from 'fs';
import { Inject, Logger, UseInterceptors } from '@nestjs/common';
import { WebsocketService } from './websocket.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapMessage, AttractapEventType } from './websocket.types';
import { AttractapService } from '../attractap.service';
import { randomBytes } from 'crypto';
import { Mutex } from 'async-mutex';
import { LicenseModuleType, LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { MetricsToggleService } from '../../metrics/settings/metrics-toggle.service';
import { WS_METRICS } from '../../metrics/definitions/tokens';
import { ATTRACTAP_GATEWAY_LABEL, WsMetrics } from '../../metrics/definitions/ws.metrics';
import { WsMetricsInterceptor } from '../../metrics/instrumentation/ws/ws.interceptor';
import { ResourceListService } from './handlers/resource-list.service';
import { AttractapAuthHandler } from './handlers/auth.handler';
import { AttractapFirmwareHandler } from './handlers/firmware.handler';
import { AttractapCrashReportHandler } from './handlers/crash-report.handler';
import { AttractapCardHandler } from './handlers/card.handler';
import { AttractapFormsHandler } from './handlers/forms.handler';
import { AttractapSessionHandler } from './handlers/session.handler';
import { AttractapBillingHandler } from './handlers/billing.handler';
import { AttractapProjectsHandler } from './handlers/projects.handler';
import { AttractapSupervisionHandler } from './handlers/supervision.handler';

@WebSocketGateway({ path: '/api/attractap/websocket' })
@UseInterceptors(WsMetricsInterceptor)
export class AttractapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AttractapGateway.name);
  private readonly clientResponseAwaitersMutex = new Mutex();

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(LicenseService)
  private licenseService: LicenseService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(WS_METRICS)
  private wsMetrics: WsMetrics;

  @Inject(MetricsToggleService)
  private metricsToggle: MetricsToggleService;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(AttractapAuthHandler)
  private authHandler: AttractapAuthHandler;

  @Inject(AttractapFirmwareHandler)
  private firmwareHandler: AttractapFirmwareHandler;

  @Inject(AttractapCrashReportHandler)
  private crashReportHandler: AttractapCrashReportHandler;

  @Inject(AttractapCardHandler)
  private cardHandler: AttractapCardHandler;

  @Inject(AttractapFormsHandler)
  private formsHandler: AttractapFormsHandler;

  @Inject(AttractapSessionHandler)
  private sessionHandler: AttractapSessionHandler;

  @Inject(AttractapBillingHandler)
  private billingHandler: AttractapBillingHandler;

  @Inject(AttractapProjectsHandler)
  private projectsHandler: AttractapProjectsHandler;

  @Inject(AttractapSupervisionHandler)
  private supervisionHandler: AttractapSupervisionHandler;

  private readonly connectedAt = new WeakMap<object, bigint>();

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

  private clientResponseAwaiters: Array<{
    id: string;
    clientId: string;
    type: AttractapEventType;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  private async waitForClientResponse(client: AuthenticatedWebSocket, type: AttractapEventType, timeoutMs = 4000) {
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

      // Only remove the awaiters we just resolved, not all awaiters for this client.
      // Previously we removed all client awaiters, which could prematurely clear
      // awaiters for other in-flight messages (e.g. ACK_RESOURCE_LIST clearing
      // READER_FIRMWARE_UPDATE_REQUIRED awaiter before its ACK arrived).
      const resolvedIds = new Set(matchingAwaiters.map((a) => a.id));
      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => !resolvedIds.has(awaiter.id));
    });
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

  private async clientWasActive(socket: AuthenticatedWebSocket) {
    if (socket.readerId) {
      await this.attractapService.updateLastReaderConnection(socket.readerId);
    }
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

    switch (eventData.type) {
      case AttractapEventType.READER_REGISTER:
        await this.authHandler.handleReaderRegister(socket, eventData);
        break;
      case AttractapEventType.READER_AUTHENTICATE:
        await this.authHandler.handleAuthentication(socket, eventData);
        break;
      case AttractapEventType.READER_FIRMWARE_INFO:
        await this.firmwareHandler.handleFirmwareInfo(socket, eventData);
        break;
      case AttractapEventType.READER_CRASH_REPORT:
        await this.crashReportHandler.handleCrashReport(socket, eventData);
        break;
      case AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA:
        await this.cardHandler.handleCardAuthenticationRequest(socket, eventData);
        break;
      case AttractapEventType.SUPERVISION_REQUEST:
        await this.supervisionHandler.handleSupervisionRequest(socket, eventData);
        break;
      case AttractapEventType.REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA:
        await this.supervisionHandler.handleSupervisorCardAuthRequest(socket, eventData);
        break;
      case AttractapEventType.SUPERVISOR_CARD_AUTH_CONFIRMED:
        await this.supervisionHandler.handleSupervisorCardAuthConfirmed(socket, eventData);
        break;
      case AttractapEventType.SUPERVISION_CANCEL:
        await this.supervisionHandler.handleSupervisionCancel(socket);
        break;
      case AttractapEventType.START_RESOURCE_USAGE_SESSION:
        await this.sessionHandler.handleStartResourceUsageSession(socket, eventData);
        break;
      case AttractapEventType.STOP_RESOURCE_USAGE_SESSION:
        await this.sessionHandler.handleStopResourceUsageSession(socket, eventData);
        break;
      case AttractapEventType.LOCK_DOOR:
        await this.sessionHandler.handleLockDoor(socket, eventData);
        break;
      case AttractapEventType.UNLOCK_DOOR:
        await this.sessionHandler.handleUnlockDoor(socket, eventData);
        break;
      case AttractapEventType.UNLATCH_DOOR:
        await this.sessionHandler.handleUnlatchDoor(socket, eventData);
        break;
      case AttractapEventType.TRIGGER_FLOW_BUTTON:
        await this.sessionHandler.handleTriggerFlowButton(socket, eventData);
        break;
      case AttractapEventType.BILLING_REQUEST_TOPUP:
        await this.billingHandler.handleBillingRequestTopup(socket, eventData);
        break;
      case AttractapEventType.FIRMWARE_REQUEST_CHUNK:
        await this.firmwareHandler.handleFirmwareChunkRequest(socket, eventData);
        break;
      case AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY:
        await this.cardHandler.onEnrollNewCardRequestNFCKey(socket, eventData);
        break;

      case AttractapEventType.ENROLL_NEW_CARD:
        await this.cardHandler.onEnrollNewCard(socket, eventData);
        break;
      case AttractapEventType.ENROLL_NEW_CARD_CANCEL:
        await this.cardHandler.onEnrollNewCardCancel(socket);
        break;

      case AttractapEventType.RESET_NFC_CARD:
        await this.cardHandler.onResetNfcCard(socket, eventData);
        break;
      case AttractapEventType.RESET_NFC_CARD_CANCEL:
        await this.cardHandler.onResetNfcCardCancel(socket);
        break;

      case AttractapEventType.PROJECTS_OF_USER:
        await this.projectsHandler.handleProjectsOfUserRequest(socket, eventData);
        break;

      case AttractapEventType.RESOURCE_USAGE_FORM_GET_FIELDS:
        await this.formsHandler.handleResourceUsageFormGetFields(socket, eventData);
        break;

      case AttractapEventType.RESOURCE_USAGE_FORM_SUBMIT_PAGE:
        await this.formsHandler.handleResourceUsageFormSubmitPage(socket, eventData);
        break;

      case AttractapEventType.RESOURCE_USAGE_FORM_CANCEL:
        this.formsHandler.handleResourceUsageFormCancel(socket, eventData);
        break;

      case AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED:
        // no-op on server; metadata-only event sent by server
        break;
      case AttractapEventType.RESOURCE_LIST:
      case AttractapEventType.READER_UNAUTHORIZED:
      case AttractapEventType.READER_REQUEST_AUTHENTICATION:
      case AttractapEventType.READER_AUTHENTICATED:
      case AttractapEventType.CARD_AUTHENTICATION_DATA:
      case AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA:
      case AttractapEventType.SUPERVISION_RESOLVED:
      case AttractapEventType.SUPERVISION_START:
      case AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO:
      case AttractapEventType.RESOURCE_USAGE_FORM_REQUEST:
      case AttractapEventType.RESOURCE_USAGE_FORM_FIELDS:
      case AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT:
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

  public async sendResourceList(readerId: number) {
    return this.resourceListService.sendResourceList(readerId);
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

  public async startEnrollOfNewNfcCard(data: { readerId: number; userId: number }) {
    return this.cardHandler.startEnrollOfNewNfcCard(data);
  }

  public async startResetOfNfcCard(data: { readerId: number; userId: number; cardId: number }) {
    return this.cardHandler.startResetOfNfcCard(data);
  }
}
