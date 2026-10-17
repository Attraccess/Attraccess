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

    const lastAuthenticatedUserId = socket.state.lastAuthenticatedUserId;
    if (lastAuthenticatedUserId == null) {
      await socket.sendMessage(new AttractapEvent(eventType, { ...correlation, error: 'USER_NOT_AUTHENTICATED' }));
      return false;
    }

    const user = await this.usersService.findOne({ id: lastAuthenticatedUserId });
    if (!user) {
      await socket.sendMessage(new AttractapEvent(eventType, { ...correlation, error: 'USER_NOT_FOUND' }));
      return false;
    }

    return true;
  }
}
