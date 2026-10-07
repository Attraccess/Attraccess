import { User } from '@attraccess/database-entities';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReaderSupervisionCallbacks, SupervisionService } from '../../../resources/supervision/supervision.service';
import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { AttractapSupervisionHandlerRouteContext } from './supervision.handler.route-context';
export abstract class ReaderSupervisionArmImplementation extends AttractapSupervisionHandlerRouteContext {
  /**
   * Web-initiated supervision (ATT-816): put a reader into its supervisor-card wait state on behalf
   * of a requester who is using the web UI. Nobody has tapped a card here, so the requester comes
   * from the HTTP session and the reader is told not to start the session itself.
   */
  protected async armReader(params: {
    readerId: number;
    resourceId: number;
    requester: User;
    requestId: string;
  }): Promise<ReaderSupervisionCallbacks> {
    const { readerId, resourceId, requester, requestId } = params;

    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader) {
      throw new NotFoundException(`Reader not found: ${readerId}`);
    }

    // Supervision draws its whole UI on the reader's screen; display-less readers cannot run it.
    if (!reader.firmware.capabilities.cardEnrollment) {
      throw new BadRequestException('This reader does not support supervisor authentication');
    }

    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
    if (sockets.length === 0) {
      throw new BadRequestException('The selected reader is offline');
    }

    // A live session is something a user would notice losing. Asked of the source of truth rather
    // than mirrored into socket state, so it cannot go stale.
    //
    // Checked BEFORE the socket state below, deliberately: this is a DB round-trip, and an await
    // between the socket check and the assignment would let two concurrent arms of the same reader
    // both pass and the second silently overwrite the first.
    for (const linkedResource of reader.resources ?? []) {
      if (await this.resourceUsageService.getActiveSession(linkedResource.id, false)) {
        throw new ConflictException('The selected reader has a session in progress');
      }
    }

    // --- no awaits from here to the assignment, so check-and-claim stays atomic ---

    // "Busy" also means a sub-flow that owns the screen. Deliberately NOT keyed on
    // `lastAuthenticatedUserId`: that records the last card ever tapped on this socket and is only
    // cleared by the enrollment paths, so it survives for the life of the websocket. Using it would
    // make every reader that has been touched once permanently "busy".
    if (
      sockets.some(
        (socket) => socket.state.supervisionFlow || socket.state.enrollNewCardData || socket.state.resetNfcCardData,
      )
    ) {
      throw new ConflictException('The selected reader is busy with another operation');
    }

    for (const socket of sockets) {
      socket.state.supervisionFlow = {
        resourceId,
        requesterUserId: requester.id,
        requestId,
        approvedSupervisorUserId: null,
        webInitiated: true,
      };
    }

    // Send to every socket for this reader so a stale/disconnecting one cannot swallow the event.
    const acknowledged = await Promise.all(
      sockets.map((socket) =>
        socket
          .sendMessage(
            new AttractapEvent(AttractapEventType.SUPERVISION_START, {
              requestId,
              resourceId,
              requesterUsername: requester.username,
              timeoutMs: SupervisionService.APPROVAL_TTL_MS,
            }),
          )
          .catch((error) => {
            this.logger.debug(`Failed to send SUPERVISION_START to client ${socket.id}: ${String(error)}`);
            return false;
          }),
      ),
    );

    // A connected-but-unresponsive reader used to arm "successfully": the caller got a 200 and a 30s
    // countdown at a screen that never appeared. One ACK is enough — with several sockets for one
    // reader, the others may legitimately be stale.
    if (!acknowledged.some(Boolean)) {
      for (const socket of sockets) {
        if (socket.state.supervisionFlow?.requestId === requestId) {
          socket.state.supervisionFlow = null;
        }
      }
      throw new BadRequestException('The selected reader did not respond');
    }

    const notifyReader = (payload: Record<string, unknown>) => {
      for (const socket of sockets) {
        if (socket.state.supervisionFlow?.requestId !== requestId) {
          continue;
        }
        socket.state.supervisionFlow = null;
        void socket.sendMessage(new AttractapEvent(AttractapEventType.SUPERVISION_RESOLVED, payload));
      }
    };

    return {
      onResolved: (_session, supervisor) =>
        notifyReader({ success: true, resourceId, supervisorUsername: supervisor.username }),
      onFailed: (error) => notifyReader({ success: false, resourceId, error: error?.message ?? 'SUPERVISION_FAILED' }),
    };
  }

  protected async getSupervisorNames(supervisorIds: number[]): Promise<string[]> {
    const names: string[] = [];
    for (const id of supervisorIds) {
      const user = await this.usersService.findOne({ id });
      if (user) {
        names.push(user.username);
      }
    }
    return names;
  }
}
