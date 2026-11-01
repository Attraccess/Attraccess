import { Inject, Injectable, Logger } from '@nestjs/common';
import { PANIC_CLASS_RESET_REASONS } from '@attraccess/plugins-backend-sdk';
import { ReaderUiAlertsService } from '../../../../plugin-system/reader-ui/reader-ui-alerts.service';
import { type AttractapEvent, type AuthenticatedWebSocket } from '../../websocket.types';
import { CardSessionService } from './card-session.service';
import { UiSlotService } from './ui-slot.service';
import { UiStepService } from './ui-step.service';

/**
 * Reader-to-server UI messages. These handlers only record answers and state; they cannot start, stop or
 * authorize anything, and they deliberately do not inject the usage service.
 */
@Injectable()
export class AttractapUiHandler {
  private readonly logger = new Logger(AttractapUiHandler.name);

  @Inject(UiStepService)
  private steps: UiStepService;

  @Inject(UiSlotService)
  private slots: UiSlotService;

  @Inject(CardSessionService)
  private cardSessions: CardSessionService;

  @Inject(ReaderUiAlertsService)
  private alerts: ReaderUiAlertsService;

  /** Called from READER_FIRMWARE_INFO with the validated payload fields. */
  public async onFirmwareInfo(socket: AuthenticatedWebSocket, payload: Record<string, unknown>) {
    const readerId = socket.readerId;
    const resetReason = typeof payload?.resetReason === 'string' ? payload.resetReason : null;
    // esp_reset_reason() keeps its value until the next reset, so a reconnect of a long-running reader
    // reports the same reason again. `uptimeMs` (optional) tells a fresh boot from a reconnect.
    const freshBoot = typeof payload?.uptimeMs !== 'number' || payload.uptimeMs < 120_000;
    if (
      readerId != null &&
      freshBoot &&
      resetReason &&
      (PANIC_CLASS_RESET_REASONS as readonly string[]).includes(resetReason)
    ) {
      this.alerts.touchCrash(readerId);
      await this.alerts
        .raise('crash-loop', `Reader reset with ${resetReason}; plugin contributions are suspended`, { readerId })
        .catch(() => undefined);
    }
    const capabilities = payload?.capabilities as { ui?: unknown } | undefined;
    await this.slots.onFirmwareInfo(socket, capabilities?.ui);
  }

  public handleStepResult(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) {
    this.steps.handleResult(socket, eventData.payload ?? {});
  }

  public handleRenderReport(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) {
    this.slots.renderReport(socket, eventData.payload ?? {});
  }

  public handleCardSessionEnded(socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) {
    const id = eventData.payload?.cardSessionId;
    if (typeof id !== 'string') {
      this.logger.debug('CARD_SESSION_ENDED without cardSessionId ignored');
      return;
    }
    this.cardSessions.end(socket, id, 'reader');
  }

  /** Socket closed: steps are discarded and timers released. */
  public cleanup(socket: AuthenticatedWebSocket) {
    this.steps.discardAll(socket);
    const card = socket.state?.cardSession;
    if (card?.expiryTimer) clearTimeout(card.expiryTimer);
    if (socket.state) socket.state.cardSession = null;
    this.slots.cleanup(socket);
  }
}
