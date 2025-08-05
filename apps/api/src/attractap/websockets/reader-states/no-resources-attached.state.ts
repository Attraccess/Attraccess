import { Logger } from '@nestjs/common';
import { ReaderState } from './reader-state.interface';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEventType } from '../websocket.types';
import { AttractapEvent } from '../websocket.types';

export class NoResourcesAttachedState implements ReaderState {
  private readonly logger = new Logger(NoResourcesAttachedState.name);

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(): Promise<void> {
    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
        message: `No Resources`,
      })
    );
  }

  public async onStateExit(): Promise<void> {
    return;
  }

  public async onEvent(/* data: AttractapEvent['data'] */) {
    return;
  }

  public async onResponse(/* data: AttractapResponse['data'] */) {
    return;
  }
}
