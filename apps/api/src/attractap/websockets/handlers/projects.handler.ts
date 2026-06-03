import { Inject, Injectable } from '@nestjs/common';
import { ProjectsService } from '../../../projects/projects.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

@Injectable()
export class AttractapProjectsHandler {
  @Inject(ProjectsService)
  private projectsService: ProjectsService;

  public async handleProjectsOfUserRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    const userId = socket.state.lastAuthenticatedUserId;
    if (!userId) {
      await socket.sendMessage(
        new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { error: 'USER_NOT_AUTHENTICATED' }),
      );
      return;
    }

    const { page = 1, limit = 10 } = data.payload as { page?: number; limit?: number };

    const projects = await this.projectsService.findMany(userId, { page, limit });
    const total = await this.projectsService.getTotalCount(userId);
    await socket.sendMessage(new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { projects, page, limit, total }));
  }
}
