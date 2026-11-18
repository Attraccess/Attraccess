import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectMemberRole, type ProjectMemberRecord, type ProjectRecord } from '@attraccess/application-models';
import { ProjectAccessInfoDto } from './dto/project-access.dto';
import { PROJECT_STORE, type ProjectStore } from './project.port';

/** A project together with what the requesting user may do with it. */
export type ProjectWithAccess = ProjectRecord & { access: ProjectAccessInfoDto };

@Injectable()
export class ProjectAccessService {
  constructor(@Inject(PROJECT_STORE) private readonly projects: ProjectStore) {}

  async ensureOwner(userId: number, projectId: number): Promise<ProjectRecord> {
    const project = await this.projects.findOwned(userId, projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async getAccessOrThrow(userId: number, projectId: number): Promise<ProjectWithAccess> {
    const project = await this.projects.findWithOwner(projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = project.owner?.id === userId;
    if (isOwner) {
      return this.applyAccessMetadata(project, null, true);
    }

    const membership = await this.projects.findMembership(projectId, userId);

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    return this.applyAccessMetadata(project, membership, false);
  }

  async addAccessMetadata(userId: number, projects: ProjectRecord[]): Promise<ProjectWithAccess[]> {
    if (!projects.length) {
      return [];
    }

    const memberships = await this.projects.findMembershipsOfUser(
      userId,
      projects.map((project) => project.id),
    );

    const membershipByProjectId = new Map<number, ProjectMemberRecord>();
    memberships.forEach((membership) => {
      membershipByProjectId.set(membership.projectId, membership);
    });

    return projects.map((project) => {
      const isOwner = project.owner?.id === userId;
      const membership = membershipByProjectId.get(project.id) ?? null;
      return this.applyAccessMetadata(project, membership, isOwner);
    });
  }

  private applyAccessMetadata(
    project: ProjectRecord,
    membership: ProjectMemberRecord | null,
    isOwner: boolean,
  ): ProjectWithAccess {
    const access: ProjectAccessInfoDto = {
      isOwner,
      role: membership?.role ?? null,
      canManageProject: isOwner || this.canMemberManageProject(membership),
    };

    return { ...project, access };
  }

  private canMemberManageProject(membership: ProjectMemberRecord | null): boolean {
    if (!membership) {
      return false;
    }

    return membership.role === ProjectMemberRole.VIEWER ? false : false;
  }
}
