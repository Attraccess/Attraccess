import { Inject, Injectable } from '@nestjs/common';
import { ProjectsService } from '../../../../projects/projects.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';

const MAX_PROJECT_SEARCH_LENGTH = 100;

@Injectable()
export class AttractapProjectsHandler {
  @Inject(ProjectsService)
  private projectsService: ProjectsService;

  public async handleProjectsOfUserRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const userId = socket.state.verifiedUserId;
    if (!userId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { error: 'USER_NOT_AUTHENTICATED' }),
      );
      return;
    }

    const request = data.payload as { page?: number; limit?: number; search?: unknown; requestId?: number };
    const { page = 1, limit = 10, requestId } = request;
    // Readers use the echoed query and request ID to discard responses to superseded requests.
    const correlation = Number.isSafeInteger(requestId) && requestId > 0 ? { requestId } : {};
    const search = typeof request.search === 'string' ? request.search.trim().slice(0, MAX_PROJECT_SEARCH_LENGTH) : '';

    const projects = await this.projectsService.findMany(userId, { page, limit, search });
    const total = await this.projectsService.getTotalCount(userId, { search });
    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { projects, page, limit, total, search, ...correlation }),
    );
  }
}
