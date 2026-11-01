import type { AttractapService } from '../attractap.service';
import type { AttractapAuthHandler } from './handlers/auth/auth.handler';
import type { AttractapBillingHandler } from './handlers/billing/billing.handler';
import type { AttractapCardHandler } from './handlers/card/card.handler';
import type { AttractapCrashReportHandler } from './handlers/crash-report/crash-report.handler';
import type { AttractapFirmwareHandler } from './handlers/firmware/firmware.handler';
import type { AttractapFormsHandler } from './handlers/forms/forms.handler';
import type { AttractapMassIntroductionHandler } from './handlers/mass-introduction/mass-introduction.handler';
import type { AttractapProjectsHandler } from './handlers/projects/projects.handler';
import type { ResourceListService } from './handlers/resource-list/resource-list.service';
import type { AttractapSessionHandler } from './handlers/session/session.handler';
import type { AttractapSupervisionHandler } from './handlers/supervision/supervision.handler';
import type { AttractapUiHandler } from './handlers/ui/ui.handler';
import { AttractapEventType, type AttractapEvent, type AuthenticatedWebSocket } from './websocket.types';

export type AttractapEventHandler = (socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) => unknown;

/** The gateway members the dispatch table reads. They are injected after construction, so read lazily. */
export interface EventHandlerDeps {
  attractapService: AttractapService;
  authHandler: AttractapAuthHandler;
  firmwareHandler: AttractapFirmwareHandler;
  crashReportHandler: AttractapCrashReportHandler;
  cardHandler: AttractapCardHandler;
  formsHandler: AttractapFormsHandler;
  sessionHandler: AttractapSessionHandler;
  billingHandler: AttractapBillingHandler;
  projectsHandler: AttractapProjectsHandler;
  supervisionHandler: AttractapSupervisionHandler;
  massIntroductionHandler: AttractapMassIntroductionHandler;
  resourceListService: ResourceListService;
  uiHandler: AttractapUiHandler;
  rejectServerEvent(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']): never;
}

/** Typed `Record<AttractapEventType, ...>`: every event type must be listed here. */
export function buildEventHandlers(d: EventHandlerDeps): Record<AttractapEventType, AttractapEventHandler> {
  return {
    [AttractapEventType.READER_REGISTER]: (socket, eventData) => d.authHandler.handleReaderRegister(socket, eventData),
    [AttractapEventType.READER_AUTHENTICATE]: (socket, eventData) =>
      d.authHandler.handleAuthentication(socket, eventData),
    [AttractapEventType.READER_FIRMWARE_INFO]: (socket, eventData) =>
      d.firmwareHandler.handleFirmwareInfo(socket, eventData),
    [AttractapEventType.READER_CRASH_REPORT]: (socket, eventData) =>
      d.crashReportHandler.handleCrashReport(socket, eventData),
    [AttractapEventType.REQUEST_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      d.cardHandler.handleCardAuthenticationRequest(socket, eventData),
    [AttractapEventType.SUPERVISION_REQUEST]: (socket, eventData) =>
      d.supervisionHandler.handleSupervisionRequest(socket, eventData),
    [AttractapEventType.REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      d.supervisionHandler.handleSupervisorCardAuthRequest(socket, eventData),
    [AttractapEventType.SUPERVISOR_CARD_AUTH_CONFIRMED]: (socket, eventData) =>
      d.supervisionHandler.handleSupervisorCardAuthConfirmed(socket, eventData),
    [AttractapEventType.SUPERVISION_CANCEL]: (socket) => d.supervisionHandler.handleSupervisionCancel(socket),
    [AttractapEventType.REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      d.massIntroductionHandler.handleCardAuthRequest(socket, eventData),
    [AttractapEventType.MASS_INTRODUCTION_CARD_AUTH_CONFIRMED]: (socket, eventData) =>
      d.massIntroductionHandler.handleCardAuthConfirmed(socket, eventData),
    [AttractapEventType.MASS_INTRODUCTION_CANCEL]: (socket, eventData) =>
      d.massIntroductionHandler.handleCancel(socket, eventData),
    [AttractapEventType.START_RESOURCE_USAGE_SESSION]: (socket, eventData) =>
      d.sessionHandler.handleStartResourceUsageSession(socket, eventData),
    [AttractapEventType.STOP_RESOURCE_USAGE_SESSION]: (socket, eventData) =>
      d.sessionHandler.handleStopResourceUsageSession(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_STATS]: (socket, eventData) =>
      d.sessionHandler.handleResourceUsageStats(socket, eventData),
    [AttractapEventType.LOCK_DOOR]: (socket, eventData) => d.sessionHandler.handleLockDoor(socket, eventData),
    [AttractapEventType.UNLOCK_DOOR]: (socket, eventData) => d.sessionHandler.handleUnlockDoor(socket, eventData),
    [AttractapEventType.UNLATCH_DOOR]: (socket, eventData) => d.sessionHandler.handleUnlatchDoor(socket, eventData),
    [AttractapEventType.TRIGGER_FLOW_BUTTON]: (socket, eventData) =>
      d.sessionHandler.handleTriggerFlowButton(socket, eventData),
    [AttractapEventType.BILLING_REQUEST_TOPUP]: (socket, eventData) =>
      d.billingHandler.handleBillingRequestTopup(socket, eventData),
    [AttractapEventType.FIRMWARE_REQUEST_CHUNK]: (socket, eventData) =>
      d.firmwareHandler.handleFirmwareChunkRequest(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY]: (socket, eventData) =>
      d.cardHandler.onEnrollNewCardRequestNFCKey(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD]: (socket, eventData) => d.cardHandler.onEnrollNewCard(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD_CANCEL]: (socket) => d.cardHandler.onEnrollNewCardCancel(socket),
    [AttractapEventType.RESET_NFC_CARD]: (socket, eventData) => d.cardHandler.onResetNfcCard(socket, eventData),
    [AttractapEventType.RESET_NFC_CARD_CANCEL]: (socket) => d.cardHandler.onResetNfcCardCancel(socket),
    [AttractapEventType.PROJECTS_OF_USER]: (socket, eventData) =>
      d.projectsHandler.handleProjectsOfUserRequest(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_GET_FIELDS]: (socket, eventData) =>
      d.formsHandler.handleResourceUsageFormGetFields(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_SUBMIT_PAGE]: (socket, eventData) =>
      d.formsHandler.handleResourceUsageFormSubmitPage(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_CANCEL]: (socket, eventData) => {
      d.formsHandler.handleResourceUsageFormCancel(socket, eventData);
    },
    [AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED]: () => undefined,
    [AttractapEventType.READER_START_PAIRING]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.REQUEST_RESOURCE_LIST]: (socket, eventData) =>
      d.resourceListService.sendResourceListToSocket(socket, { requestId: eventData.payload?.requestId }),
    [AttractapEventType.RESOURCE_LIST]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_UNAUTHORIZED]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_REQUEST_AUTHENTICATION]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_AUTHENTICATED]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.READER_LANGUAGE]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.CARD_AUTHENTICATION_DATA]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      d.rejectServerEvent(socket, eventData),
    [AttractapEventType.SUPERVISION_RESOLVED]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.SUPERVISION_START]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.MASS_INTRODUCTION_START]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA]: (socket, eventData) =>
      d.rejectServerEvent(socket, eventData),
    [AttractapEventType.MASS_INTRODUCTION_RESULT]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.MASS_INTRODUCTION_END]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO]: (socket, eventData) =>
      d.rejectServerEvent(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_REQUEST]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_FIELDS]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.RESOURCE_USAGE_FORM_PAGE_RESULT]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    // Reader UI (ATT-1187). Server-to-reader types are rejected like the other server-side events.
    [AttractapEventType.UI_SLOT_UPDATE]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.UI_STEP_REQUEST]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.UI_STEP_CANCEL]: (socket, eventData) => d.rejectServerEvent(socket, eventData),
    [AttractapEventType.UI_STEP_RESULT]: (socket, eventData) => d.uiHandler.handleStepResult(socket, eventData),
    [AttractapEventType.UI_RENDER_REPORT]: (socket, eventData) => d.uiHandler.handleRenderReport(socket, eventData),
    [AttractapEventType.CARD_SESSION_ENDED]: (socket, eventData) =>
      d.uiHandler.handleCardSessionEnded(socket, eventData),
    // Phase 7 (custom screens) is not implemented: messages of these types are dropped.
    [AttractapEventType.UI_SCREEN_OPEN]: () => undefined,
    [AttractapEventType.UI_SCREEN_CLOSE]: () => undefined,
    [AttractapEventType.UI_SCREEN_DISMISSED]: () => undefined,
    [AttractapEventType.UI_ACTION]: () => undefined,
  };
}
