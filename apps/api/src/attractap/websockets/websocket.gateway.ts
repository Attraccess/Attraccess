import { OnEvent } from '@nestjs/event-emitter';
import { remoteEvent } from './reader-event-relay';
import { Inject, Logger, Optional, UseInterceptors } from '@nestjs/common';
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
import { AttractapMassIntroductionHandler } from './handlers/mass-introduction/mass-introduction.handler';
import { CardConversationService, CardConversationFailure } from './card-conversation.service';
import { CardDetectedRouter } from './card-detected.router';
import { AttractapUiHandler } from './handlers/ui/ui.handler';
import { ReaderBleDriver } from './handlers/ble/reader-ble.driver';
import { createReaderSenders } from './reader-socket-send';
import { cleanupSocketState } from './websocket-disconnect-cleanup';
import { buildEventHandlers, type EventHandlerDeps } from './websocket-event-handlers';
import { CREDENTIAL_CHANGED_EVENT, PairingService } from '../security/pairing.service';
import { ReaderSessionService } from '../security/reader-session.service';
import { PAIRING_SUBPROTOCOL, SESSION_SUBPROTOCOL } from '../security/session-framing';
import { readerWebSocketOptions } from './websocket-transport-options';
import { WebsocketService } from './websocket.service';
import { LegacyFirmwareUpdateService } from './legacy-firmware-update.service';
import { ReaderRouter } from './reader-router';
import { ReaderTimeZoneService } from './reader-time-zone.service';
import { readerHeartbeat } from './websocket-reader-payloads';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';
import { SKIPS_ACTIVITY_WRITE } from './websocket-activity';
import { randomBytes } from 'crypto';
import type { IncomingMessage } from 'http';
import type { AuditAuthenticationMethod as AuthenticationMethod } from '@attraccess/application-models';

/** Events of the removed token sign-in; a session that sends one is closed (old readers use LegacyFirmwareUpdateService). */
const TOKEN_SIGN_IN_EVENTS = new Set<string>(['READER_REGISTER', 'READER_AUTHENTICATE']);

@WebSocketGateway({
  path: '/api/attractap/websocket',
  ...readerWebSocketOptions,
})
@UseInterceptors(WsMetricsInterceptor)
export class AttractapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  protected readonly logger = new Logger(AttractapGateway.name);

  protected readonly clientResponseAwaitersMutex = new Mutex();

  @Inject(ReaderTimeZoneService)
  private readerTimeZone: ReaderTimeZoneService;

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

  @Inject(CardConversationService)
  protected cardConversations: CardConversationService;

  @Inject(CardDetectedRouter)
  protected cardDetectedRouter: CardDetectedRouter;

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

  @Inject(AttractapUiHandler)
  protected uiHandler: AttractapUiHandler;

  @Inject(AttractapMassIntroductionHandler)
  protected massIntroductionHandler: AttractapMassIntroductionHandler;

  @Inject(PairingService)
  protected pairingService: PairingService;

  @Inject(LegacyFirmwareUpdateService)
  protected legacyFirmwareUpdate: LegacyFirmwareUpdateService;

  @Inject(ReaderBleDriver)
  protected readerBleDriver: ReaderBleDriver;

  @Inject(ReaderSessionService)
  protected readerSessionService: ReaderSessionService;

  @Optional()
  @Inject(ReaderRouter)
  protected readerRouter?: ReaderRouter;

  /** Without Nest (unit tests) this instance is the whole cluster. */
  protected get router(): ReaderRouter {
    return (this.readerRouter ??= new ReaderRouter(this.websocketService));
  }

  protected readonly connectedAt = new WeakMap<object, bigint>();

  protected clientResponseAwaiters: Array<{
    id: string;
    clientId: string;
    type: AttractapEventType;
    /** Set for UI_* types: their ACKs echo the message id and are matched on it. */
    messageId?: number;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  protected readonly eventHandlers = buildEventHandlers(this as unknown as EventHandlerDeps);

  /**
   * Tells a reader that runs firmware before 2.0.0 that the server offers it no card functions.
   * The reply is shaped like the answer to the legacy request so the reader shows an error.
   */
  protected async requireFirmwareUpdate(
    socket: AuthenticatedWebSocket,
    replyType: AttractapEventType,
    extra: Record<string, unknown> = {},
  ) {
    await socket.sendMessage(new AttractapEvent(replyType, { ...extra, error: 'FIRMWARE_UPDATE_REQUIRED' }));
  }

  /**
   * The reader's login ended (READER_SESSION_ENDED, or CARD_SESSION_ENDED for the verified user): forget
   * the verified user and stop what depended on them. The only place that does this.
   */
  protected onReaderSessionEnded(
    socket: AuthenticatedWebSocket,
    reason: CardConversationFailure = 'READER_SESSION_ENDED',
    readerId: number | null = socket.readerId,
  ) {
    this.cardConversations.abort(socket, reason);
    this.cardHandler.clearVerifiedUser(socket);
    if (reason === 'READER_SESSION_ENDED') this.uiHandler.endCardSession(socket);
    // A closed connection (READER_UNREACHABLE) ends only the photo links it issued: a newer connection of the same
    // reader, maybe on another instance, keeps its own.
    this.formsHandler.endReaderForms(socket, { readerId, connectionClosed: reason === 'READER_UNREACHABLE' });
    if (socket.state.supervisionFlow && !socket.state.supervisionFlow.webInitiated) {
      this.supervisionHandler.cancelForSocket(socket);
    }
  }

  /**
   * Everything bound to this connection's reader identity ends: the login (as on READER_SESSION_ENDED)
   * plus flows armed for the reader (web-started supervision, mass introduction, enrollment, reset).
   * Used on disconnect and when the connection authenticates again.
   */
  protected resetReaderConnectionState(
    socket: AuthenticatedWebSocket,
    readerId: number | null,
    reason: CardConversationFailure,
  ) {
    if (!socket.state) return;
    // Plugin BLE sessions and pending calls are bound to this connection's reader identity.
    this.readerBleDriver.socketClosed(socket);
    this.onReaderSessionEnded(socket, reason, readerId);
    if (socket.state.supervisionFlow) this.supervisionHandler.cancelForSocket(socket, readerId);
    if (socket.state.massIntroductionFlow) this.massIntroductionHandler.cancelForSocket(socket, readerId);
    this.cardHandler.endCardFlows(socket, readerId);
  }

  public async sendResourceList(readerId: number) {
    return this.resourceListService.sendResourceList(readerId);
  }

  @OnEvent('settings.default-language')
  @OnEvent(remoteEvent('settings.default-language'))
  async updateReaderLanguage(language: 'en' | 'de') {
    this.websocketService.readerLanguage = language;
    const readers = Array.from(this.websocketService.sockets.values()).filter((socket) =>
      this.canReceiveReaderLanguage(socket),
    );
    await Promise.all(
      readers.map((socket) => socket.sendMessage(new AttractapEvent(AttractapEventType.READER_LANGUAGE, { language }))),
    );
  }

  private canReceiveReaderLanguage(socket: AuthenticatedWebSocket): boolean {
    return (
      typeof socket.readerId === 'number' &&
      Number.isInteger(socket.readerId) &&
      socket.readerId > 0 &&
      socket.readyState === WebSocket.OPEN
    );
  }

  public async sendResourceListToReadersWithResources(resourceIds: number[]) {
    return this.resourceListService.sendResourceListToReadersWithResources(resourceIds);
  }

  public async disconnectReader(readerId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    for (const socket of sockets) this.dropConnection(socket, readerId);
  }

  private dropConnection(socket: AuthenticatedWebSocket, readerId: number): void {
    // The connection's login and armed flows end now, not when the close event arrives. The
    // reader id stays until then: the disconnect handler needs it for metrics and mass introduction.
    this.resetReaderConnectionState(socket, readerId, 'READER_UNREACHABLE');
    // No closing handshake on either transport: a socket in CLOSING would still be found for this reader.
    socket.terminate();
  }

  /**
   * A reader holds one connection: when it signs in again, its older ones are dead. A reader that restarted never
   * closed them, so they would stay registered with their armed card flows and keep the reader busy (ATT-1426).
   * Only connections opened before this one go, so a slow handshake never ends a newer session.
   */
  private dropSupersededConnections(current: AuthenticatedWebSocket): void {
    const openedAt = this.connectedAt.get(current as unknown as object);
    for (const socket of this.router.localSockets(current.readerId)) {
      if (this.connectedAt.get(socket as unknown as object) < openedAt) {
        this.logger.log(`Reader ${current.readerId} signed in again, dropping its older connection ${socket.id}`);
        this.dropConnection(socket, current.readerId);
      }
    }
  }

  /** Revoked or re-paired credentials end live sessions immediately. */
  @OnEvent(CREDENTIAL_CHANGED_EVENT)
  @OnEvent(remoteEvent(CREDENTIAL_CHANGED_EVENT))
  public async onCredentialChanged(readerId: number) {
    await this.disconnectReader(readerId);
  }

  public async startEnrollOfNewNfcCard(data: {
    readerId: number;
    userId: number;
    actorId?: number;
    authenticationMethod?: AuthenticationMethod;
    apiTokenId?: number;
  }) {
    return this.cardHandler.startEnrollOfNewNfcCard(data);
  }

  public async startResetOfNfcCard(data: {
    readerId: number;
    userId: number;
    cardId: number;
    authenticationMethod?: AuthenticationMethod;
    apiTokenId?: number;
  }) {
    return this.cardHandler.startResetOfNfcCard(data);
  }

  protected async waitForClientResponse(
    client: AuthenticatedWebSocket,
    type: AttractapEventType,
    timeoutMs = 4000,
    messageId?: number,
  ) {
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

      this.clientResponseAwaiters.push({ id, clientId: client.id, type, messageId, resolve: onResolve, timeoutId });
    });
  }

  protected async resolveClientResponseAwaiters(
    client: AuthenticatedWebSocket,
    type: AttractapEventType,
    messageId?: number,
  ) {
    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      const matchingAwaiters = this.clientResponseAwaiters.filter(
        (awaiter) =>
          awaiter.clientId === client.id &&
          awaiter.type === type &&
          (awaiter.messageId === undefined || awaiter.messageId === messageId),
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
    // No socket state = pairing connection; violation = plain text frame on a session.
    if (!socket.state || socket.sessionViolation) return;
    this.logger.debug(`Heartbeat from client ${socket.id}.`);

    try {
      (socket as unknown as { send: (data: string) => void }).send(
        readerHeartbeat(this.readerTimeZone.serverTimeFor(socket.readerId)),
      );
    } catch (error) {
      this.logger.error(`Failed to send heartbeat ack to client ${socket.id}: ${(error as Error).message}`);
    }
    // A zone that could not be resolved in time (e.g. right after an API restart) is asked for again.
    this.readerTimeZone.onHeartbeat(socket.readerId);
    await this.clientWasActive(socket);
  }

  @SubscribeMessage('EVENT')
  public async onClientEvent(
    @MessageBody() eventData: AttractapEvent['data'],
    @ConnectedSocket() socket: AuthenticatedWebSocket,
  ) {
    // No socket state = pairing connection; violation = plain text frame on a session.
    if (!socket.state || socket.sessionViolation) return;
    if (TOKEN_SIGN_IN_EVENTS.has(eventData?.type)) {
      // The certificate is the identity; token sign-in is gone. Nothing of the message is logged: it carries a token.
      this.logger.warn(`Closing session ${socket.id}: token sign-in no longer supported`);
      socket.terminate();
      return;
    }
    if (eventData.type.startsWith('ACK_')) {
      this.logger.debug(`Received ${eventData.type} from client ${socket.id}`);

      this.resolveClientResponseAwaiters(
        socket,
        eventData.type.replace('ACK_', '') as AttractapEventType,
        eventData.messageId,
      );
      return;
    }

    if (!socket.readerId) {
      this.logger.error('Client has no reader attached. ignoring event.');
      return;
    }

    // Not awaited: the WS adapter runs a socket's handlers concurrently, so an await here would let a
    // later event (a tap) overtake an earlier one (READER_SESSION_ENDED). Card events skip the write
    // entirely (the BUSY check comes first); heartbeats keep lastConnection fresh.
    if (!SKIPS_ACTIVITY_WRITE.has(eventData.type)) {
      void this.clientWasActive(socket).catch((error: Error) =>
        this.logger.warn(`Could not record reader activity for client ${socket.id}: ${error.message}`),
      );
    }

    this.logger.debug(`Received event ${eventData.type} from client ${socket.id}`);

    if (!Object.hasOwn(this.eventHandlers, eventData.type)) throw new Error(`Unknown event type: ${eventData.type}`);
    await this.eventHandlers[eventData.type](socket, eventData);
  }

  protected rejectServerEvent(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']): never {
    this.logger.error(
      `Received event of type ${eventData.type} from client ${socket.id}, this is a server side only event, clients should not send this event`,
    );
    throw new Error('THIS IS A SERVER SIDE ONLY EVENT, CLIENTS SHOULD NOT SEND THIS EVENT');
  }

  public async handleConnection(client: WebSocket, request?: IncomingMessage) {
    if (client.protocol === PAIRING_SUBPROTOCOL) {
      // Unlicensed installations take no pairing requests (the service closes the socket).
      const licensed = this.licenseService.verifyLicense({ modules: [LicenseModuleType.ATTRACTAP] });
      licensed.catch(() => this.logger.error('Closing pairing connection due to license error'));
      this.pairingService.handleConnection(
        client,
        request as IncomingMessage,
        licensed.then(() => undefined),
      );
      return;
    }
    if (client.protocol !== SESSION_SUBPROTOCOL) {
      // No subprotocol: an old reader with token sign-in. It may only update its firmware, then it pairs.
      const licensed = this.licenseService.verifyLicense({ modules: [LicenseModuleType.ATTRACTAP] });
      this.legacyFirmwareUpdate.handleConnection(
        client,
        licensed.then(() => undefined),
      );
      return;
    }
    // Taken over before the first await: early TLS bytes must not be missed and a stray text
    // frame must be flagged before the framework's own message listener sees it.
    const session = this.readerSessionService.open(client);

    this.connectedAt.set(client as unknown as object, process.hrtime.bigint());
    this.logger.log('Client connected via WebSocket');

    try {
      await this.licenseService.verifyLicense({
        modules: [LicenseModuleType.ATTRACTAP],
      });
    } catch (error) {
      this.logger.error('Closing connection due to license error');
      this.logger.error(error);
      session.close();
      client.close();
      return;
    }

    const id = randomBytes(4).toString('base64url').slice(0, 5);
    const { sendMessage, sendRaw, sendBinaryData } = createReaderSenders({
      client,
      id,
      logger: this.logger,
      waitForAck: (socket, type, messageId) => this.waitForClientResponse(socket, type, undefined, messageId),
      canReceiveReaderLanguage: (socket) => this.canReceiveReaderLanguage(socket),
      readerLanguage: () => this.websocketService.readerLanguage,
    });

    Object.assign(client, {
      id,
      messageCount: 0,
      readerId: null,
      readerName: null,
      sendMessage,
      sendRaw,
      sendBinaryData,
      state: {
        verifiedUserId: null,
        verifiedCardUid: null,
        cardConversation: null,
        cardRelay: false,
        enrollment: null,
        resetNfcCardData: null,
        ota: null,
        supervisionFlow: null,
        massIntroductionFlow: null,
      },
    });

    // The reader is registered only once its certificate has been accepted.
    await this.readerSessionService.accept(client as unknown as AuthenticatedWebSocket, session, (socket) => {
      this.dropSupersededConnections(socket);
      this.websocketService.sockets.set(socket.id, socket);
      this.metricsService.attractapDevicesConnected.set(this.websocketService.sockets.size);
      // Other instances route this reader's work here from now on (ATT-1163).
      if (socket.readerId) this.router.cluster.presence.socketConnected(socket.readerId, socket.id);
    });
  }

  public async handleDisconnect(socket: AuthenticatedWebSocket) {
    // Invalidate asynchronous authentication before waiting on cleanup locks.
    const readerId = socket.readerId;
    const readerName = socket.readerName;
    if (socket.state) socket.state.readerAuthenticationAttempt = Symbol('reader-disconnected');
    socket.readerId = null;
    socket.readerName = null;
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
      // A socket still signing in as this reader (a reconnect) keeps the reader's time zone.
      this.readerTimeZone.forgetUnlessInUse(readerId, socket.id);
    } else {
      this.logger.log('An unidentified client disconnected.');
    }

    // The reader is gone: nobody stays logged in, no card talk goes on, and armed flows (including
    // the supervisor's web popup) are torn down.
    this.resetReaderConnectionState(socket, readerId, 'READER_UNREACHABLE');

    // Open reader UI steps, timers, the OTA file descriptor and a partial coredump upload.
    cleanupSocketState(socket, { uiHandler: this.uiHandler, crashReportHandler: this.crashReportHandler });
    this.websocketService.sockets.delete(socket.id);
    this.metricsService.attractapDevicesConnected.set(this.websocketService.sockets.size);
    if (readerId) this.router.cluster.presence.socketDisconnected(readerId, socket.id);
  }

  protected async clientWasActive(socket: AuthenticatedWebSocket) {
    if (socket.readerId) {
      await this.attractapService.updateLastReaderConnection(socket.readerId);
    }
  }
}
