import { ForbiddenException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SupervisionService, ReaderSupervisionArmer } from '../../../../resources/supervision/supervision.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';

@Injectable()
export class AttractapSupervisionHandler implements OnModuleInit {
  @Inject(SupervisionService)
  protected supervisionService: SupervisionService;

  public onModuleInit(): void {
    this.supervisionService.setReaderArmer({ arm: (params) => this.armReader(params) });
  }

  private async deny(socket: AuthenticatedWebSocket, type: AttractapEventType): Promise<void> {
    this.cancelForSocket(socket);
    await socket.sendMessage(new AttractapEvent(type, { error: 'CARD_VERIFICATION_UNAVAILABLE' }));
  }
  public async handleSupervisorCardAuthConfirmed(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.SUPERVISION_RESOLVED);
  }
  public async handleSupervisorCardAuthRequest(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA);
  }
  public async handleSupervisionRequest(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    await this.deny(socket, AttractapEventType.SUPERVISION_REQUEST);
  }
  public async handleSupervisionCancel(socket: AuthenticatedWebSocket) {
    this.cancelForSocket(socket);
  }
  public cancelForSocket(socket: AuthenticatedWebSocket): void {
    if (socket.state?.supervisionFlow?.requestId)
      this.supervisionService.cancelReaderRequest(
        socket.state.supervisionFlow.requestId,
        'Card verification unavailable',
      );
    if (socket.state) {
      socket.state.supervisionFlow = null;
      socket.state.lastAuthenticatedUserId = null;
    }
  }
  protected async armReader(_params: Parameters<ReaderSupervisionArmer['arm']>[0]): Promise<never> {
    throw new ForbiddenException('CARD_VERIFICATION_UNAVAILABLE');
  }
}
