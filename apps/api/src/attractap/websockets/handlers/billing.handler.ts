import { Inject, Injectable, Logger } from '@nestjs/common';
import { SumUpService } from '../../../billing/sumup.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

@Injectable()
export class AttractapBillingHandler {
  private readonly logger = new Logger(AttractapBillingHandler.name);

  @Inject(SumUpService)
  private sumUpService: SumUpService;

  public async handleBillingRequestTopup(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
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
}
