import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectAccessPersistence } from './persistence/port';
import { Project, ProjectMember, ProjectMemberRole } from '@attraccess/application-models';
import { ProjectAccessInfoDto, ProjectWithAccessDto } from './dto/project-access.dto';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly persistence: ProjectAccessPersistence) {}

  async ensureOwner(userId: number, projectId: number): Promise<Project> {
    const project = await this.persistence.ownedProject(userId, projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async getAccessOrThrow(userId: number, projectId: number): Promise<ProjectWithAccessDto> {
    const project = await this.persistence.projectWithOwner(projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = project.owner?.id === userId;
    if (isOwner) {
      return this.applyAccessMetadata(project, null, true);
    }

    const membership = await this.persistence.membership(userId, projectId);

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    return this.applyAccessMetadata(project, membership, false);
  }

  async addAccessMetadata(userId: number, projects: Project[]): Promise<ProjectWithAccessDto[]> {
    if (!projects.length) {
      return [];
    }

    const projectIds = projects.map((project) => project.id);
    const memberships = await this.persistence.memberships(userId, projectIds);

    const membershipByProjectId = new Map<number, ProjectMember>();
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
    project: Project,
    membership: ProjectMember | null,
    isOwner: boolean,
  ): ProjectWithAccessDto {
    const canManageProject = isOwner || this.canMemberManageProject(membership);

    const access: ProjectAccessInfoDto = {
      isOwner,
      role: membership?.role ?? null,
      canManageProject,
    };

    const projectWithAccess = project as ProjectWithAccessDto;
    projectWithAccess.access = access;
    return projectWithAccess;
  }

  private canMemberManageProject(membership: ProjectMember | null): boolean {
    if (!membership) {
      return false;
    }

    return membership.role === ProjectMemberRole.VIEWER ? false : false;
  }
}
