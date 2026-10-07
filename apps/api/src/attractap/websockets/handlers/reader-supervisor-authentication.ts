import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { ReaderSupervisionRequestImplementation } from './reader-supervision-request';
export abstract class ReaderSupervisorAuthenticationImplementation extends ReaderSupervisionRequestImplementation {
  /**
   * Reader presents a supervisor card. Validate the supervisor against the resource and (on success)
   * hand back the card's key material so the reader can crypto-authenticate the physical card. The
   * session itself starts only after the reader confirms the auth via START_RESOURCE_USAGE_SESSION.
   */
  public async handleSupervisorCardAuthRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { uid, resourceId } = data.payload as { uid: string; resourceId: number };

    const flow = socket.state.supervisionFlow;
    if (!flow || flow.resourceId !== resourceId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, {
          error: 'NO_SUPERVISION_IN_PROGRESS',
        }),
      );
      return;
    }

    if (!uid || typeof uid !== 'string') {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'INVALID_UID' }),
      );
      return;
    }

    const nfcCard = await this.attractapService.getNFCCardByUID(uid);
    if (!nfcCard) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'CARD_NOT_FOUND' }),
      );
      return;
    }

    if (!nfcCard.isActive) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'CARD_NOT_ACTIVE' }),
      );
      return;
    }

    const requester = await this.usersService.findOne({ id: flow.requesterUserId });
    if (!requester) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, { error: 'USER_NOT_FOUND' }),
      );
      return;
    }

    try {
      // Reuses the Phase-1 guard: resource supports supervision, supervisor != requester, and the
      // supervisor is an introducer.
      await this.resourceUsageService.validateSupervisedStart(resourceId, requester, nfcCard.user.id);
    } catch (error) {
      this.logger.debug(`Supervisor card rejected for resource ${resourceId}: ${(error as Error).message}`);
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, {
          error: 'SUPERVISOR_NOT_AUTHORIZED',
        }),
      );
      return;
    }

    socket.state.supervisionFlow = { ...flow, approvedSupervisorUserId: nfcCard.user.id };

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.SUPERVISOR_CARD_AUTHENTICATION_DATA, {
        keyNo: nfcCard.keyNo,
        key: nfcCard.key,
        username: nfcCard.user.username,
      }),
    );
  }
}
