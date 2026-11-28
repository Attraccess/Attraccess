import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSession, UsageSessionUser } from '@attraccess/application-models';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { ProjectsService } from '../../../projects/projects.service';
import { NoSessionToSwitchError } from '../errors/no-session-to-switch.error';

/**
 * Which session a project change means and which project it may go to: the same for moving the whole session and for
 * splitting it.
 */

/** The new project, or null for none. A person can only choose a project they are a member of. */
export async function findTargetProject(
  projects: ProjectsService,
  user: UsageSessionUser,
  projectId: number | null | undefined,
) {
  if (projectId === undefined) throw new BadRequestException('Project assignment is required');
  // The same membership check as at the start; resolved before the transaction, as it reads on its own connection.
  return projectId === null ? null : await projects.findOneById(user.id, projectId);
}

/**
 * The running session the request means: the named one, or the caller's own. Only naming somebody else's session is
 * forbidden; without a name, other people's sessions are not the caller's concern, so having none is simply 404.
 */
export function pickChangeableSession(
  sessions: UsageSession[],
  user: UsageSessionUser,
  usageId: number | undefined,
  projectId: number | null,
): UsageSession {
  const session = sessions.find((candidate) =>
    usageId === undefined ? candidate.userId === user.id : candidate.id === usageId,
  );
  if (!session) throw new NoSessionToSwitchError();
  if (session.userId !== user.id) {
    throw new ForbiddenException('Only the owner of a running session can change its project');
  }
  if (session.usageAction !== ResourceUsageAction.Usage || session.resource?.type !== ResourceType.Machine) {
    throw new BadRequestException('Only running machine sessions can change their project');
  }
  if (session.projectId === projectId) {
    throw new BadRequestException('The session already belongs to this project');
  }
  return session;
}
