import { Inject, Logger, UseInterceptors } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Mutex } from 'async-mutex';
import { Server } from 'ws';
import { LicenseService } from '../../license/license.service';
import { WS_METRICS } from '../../metrics/definitions/tokens';
import { WsMetrics } from '../../metrics/definitions/ws.metrics';
import { WsMetricsInterceptor } from '../../metrics/instrumentation/ws/ws.interceptor';
import { MetricsService } from '../../metrics/metrics.service';
import { MetricsToggleService } from '../../metrics/settings/metrics-toggle.service';
import { AttractapService } from '../attractap.service';
import { AttractapAuthHandler } from './handlers/auth.handler';
import { AttractapBillingHandler } from './handlers/billing.handler';
import { AttractapCardHandler } from './handlers/card.handler';
import { AttractapCrashReportHandler } from './handlers/crash-report.handler';
import { AttractapFirmwareHandler } from './handlers/firmware.handler';
import { AttractapFormsHandler } from './handlers/forms.handler';
import { AttractapProjectsHandler } from './handlers/projects.handler';
import { ResourceListService } from './handlers/resource-list.service';
import { AttractapSessionHandler } from './handlers/session.handler';
import { AttractapSupervisionHandler } from './handlers/supervision.handler';
import { WebsocketPublicCommandsImplementation } from './websocket-public-commands';
import { WebsocketService } from './websocket.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

@WebSocketGateway({ path: '/api/attractap/websocket' })
@UseInterceptors(WsMetricsInterceptor)
export class AttractapGateway
  extends WebsocketPublicCommandsImplementation
  implements OnGatewayConnection, OnGatewayDisconnect
{
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
}
