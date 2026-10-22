import { Inject, Injectable } from '@nestjs/common';
import { ProjectsService } from '../../../../projects/projects.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';

@Injectable()
export class AttractapProjectsHandler {
  @Inject(ProjectsService)
  private projectsService: ProjectsService;

  public async handleProjectsOfUserRequest(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    // ATT-950 must provide a reviewed verification contract before this operation can resume.
    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.PROJECTS_OF_USER, { error: 'USER_NOT_AUTHENTICATED' }),
    );
  }
}
