import { Inject, Injectable } from '@nestjs/common';
import { AttractapService } from '../../attractap.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

@Injectable()
export class ResourceActionGuard {
  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(UsersService)
  private usersService: UsersService;

  public async validateResourceAction(
    socket: AuthenticatedWebSocket,
    resourceId: number,
    eventType: AttractapEventType,
    requestId?: number,
  ): Promise<boolean> {
    const correlation = Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {};
    // Read before any await: a READER_SESSION_ENDED arriving meanwhile must not change whom this action checks.
    const verifiedUserId = socket.state.verifiedUserId;
    if (!resourceId) {
      await socket.sendMessage(new AttractapEvent(eventType, { ...correlation, error: 'INVALID_RESOURCE_ID' }));
      return false;
    }

    const reader = await this.attractapService.findReaderById(socket.readerId);
    if (!reader) {
      await socket.sendMessage(new AttractapEvent(eventType, { ...correlation, error: 'READER_NOT_FOUND' }));
      return false;
    }

    const resource = reader.resources.find((resource) => resource.id === resourceId);
    if (!resource) {
      await socket.sendMessage(
        new AttractapEvent(eventType, {
          ...correlation,
          error: 'RESOURCE_NOT_ASSOCIATED_WITH_READER',
        }),
      );
      return false;
    }

    if (verifiedUserId == null) {
      await socket.sendMessage(new AttractapEvent(eventType, { ...correlation, error: 'USER_NOT_AUTHENTICATED' }));
      return false;
    }

    const user = await this.usersService.findOne({ id: verifiedUserId });
    if (!user) {
      await socket.sendMessage(new AttractapEvent(eventType, { ...correlation, error: 'USER_NOT_FOUND' }));
      return false;
    }

    return true;
  }
}
