import { SupervisionMode } from '@attraccess/database-entities';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from '../websocket.types';
import { ReaderSupervisionArmImplementation } from './reader-supervision-arm';
export abstract class ReaderSupervisionRequestImplementation extends ReaderSupervisionArmImplementation {
  /**
   * Reader asks to open a supervision request for the user who just tapped. Broadcasts the request
   * to eligible supervisors and records the flow on the socket.
   */
  public async handleSupervisionRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const { resourceId } = data.payload as { resourceId: number };

    const requesterUserId = socket.state.lastAuthenticatedUserId;
    if (!requesterUserId) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'USER_NOT_SET' }));
      return;
    }

    const requester = await this.usersService.findOne({ id: requesterUserId });
    if (!requester) {
      await socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'USER_NOT_FOUND' }));
      return;
    }

    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'RESOURCE_NOT_FOUND' }),
      );
      return;
    }

    if (
      resource.supervisionMode !== SupervisionMode.SUPERVISION_ALLOWED &&
      resource.supervisionMode !== SupervisionMode.SUPERVISION_REQUIRED
    ) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'SUPERVISION_NOT_SUPPORTED' }),
      );
      return;
    }

    // Only introducers may supervise, so an empty list means the reader must not start a request.
    const eligibleSupervisorIds = await this.supervisionService.getEligibleSupervisorIds(resourceId, requester.id);
    if (eligibleSupervisorIds.length === 0) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, { error: 'NO_SUPERVISORS_AVAILABLE' }),
      );
      return;
    }

    // Cancel any stale flow still hanging around on this socket before opening a new one.
    this.cancelForSocket(socket);

    // Captured so the async callbacks (fired on web approval/expiry) can verify the socket is still
    // on the same flow before touching its state or messaging the reader.
    let createdRequestId: string | null = null;

    const { requestId, expiresAt } = this.supervisionService.createReaderRequest({
      resourceId,
      requester,
      // No notes/project from the reader's two-card flow.
      dto: {},
      eligibleSupervisorIds,
      callbacks: {
        onResolved: (_session, supervisor) => {
          if (socket.state.supervisionFlow?.requestId !== createdRequestId) {
            return;
          }
          socket.state.supervisionFlow = null;
          void socket.sendMessage(
            new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, {
              success: true,
              resourceId,
              supervisorUsername: supervisor.username,
            }),
          );
        },
        onFailed: (error) => {
          if (socket.state.supervisionFlow?.requestId !== createdRequestId) {
            return;
          }
          socket.state.supervisionFlow = null;
          void socket.sendMessage(
            new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, {
              success: false,
              resourceId,
              error: error?.message ?? 'SUPERVISION_FAILED',
            }),
          );
        },
      },
    });

    createdRequestId = requestId;
    socket.state.supervisionFlow = {
      resourceId,
      requesterUserId: requester.id,
      requestId,
      approvedSupervisorUserId: null,
    };

    const supervisorNames = await this.getSupervisorNames(eligibleSupervisorIds);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.SUPERVISION_REQUEST, {
        success: true,
        requestId,
        expiresAt: expiresAt.toISOString(),
        timeoutMs: SupervisionService.APPROVAL_TTL_MS,
        supervisorNames,
      }),
    );
  }
}
