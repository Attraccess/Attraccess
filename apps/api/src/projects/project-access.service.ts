import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Project, ProjectMember, ProjectMemberRole } from '@attraccess/database-entities';
import { ProjectAccessInfoDto, ProjectWithAccessDto } from './dto/project-access.dto';

@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,
  ) {}

  async ensureOwner(userId: number, projectId: number): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, owner: { id: userId } },
      relations: { owner: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async getAccessOrThrow(userId: number, projectId: number): Promise<ProjectWithAccessDto> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: { owner: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = project.owner?.id === userId;
    if (isOwner) {
      return this.applyAccessMetadata(project, null, true);
    }

    const membership = await this.projectMemberRepository.findOne({
      where: {
        project: { id: projectId },
        user: { id: userId },
      },
    });

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
    const memberships = await this.projectMemberRepository.find({
      where: {
        user: { id: userId },
        project: { id: In(projectIds) },
      },
    });

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

