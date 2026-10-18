import { Inject, Injectable } from '@nestjs/common';
import { SumUpService } from '../../../../billing/sumup/sumup.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';

@Injectable()
export class AttractapBillingHandler {
  @Inject(SumUpService)
  private sumUpService: SumUpService;

  public async handleBillingRequestTopup(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    // ATT-950 must provide a reviewed verification contract before this operation can resume.
    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.BILLING_REQUEST_TOPUP, { error: 'USER_NOT_AUTHENTICATED' }),
    );
  }
}
