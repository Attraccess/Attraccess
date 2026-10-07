import { Project, ResourceUsage } from '@attraccess/database-entities';
import { NotFoundException } from '@nestjs/common';
import { FileUpload } from '../common/types/file-upload.types';
import { CreateProjectDto } from './dto/create.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { ProjectInvitationResponseImplementation } from './project-invitation-response';
export abstract class ProjectWritingImplementation extends ProjectInvitationResponseImplementation {
  protected async setLogo(project: Project, logo: FileUpload) {
    const logoFilename = await this.fileStorageService.saveFile(logo, `projects/${project.id}`);
    project.logo = logoFilename;
  }

  public async create(
    ownerUserId: number,
    data: CreateProjectDto,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectRepository.save({
      owner: { id: ownerUserId },
      name: data.name,
      description: data.description,
    });

    await this.audit.recordProject({
      action: 'project.created',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: project.id,
      details: this.projectDetails(project, 'after'),
    });
    this.metricsService.projectsTotal.inc();

    if (data.logo) {
      const before = this.projectDetails(project, 'before');
      await this.setLogo(project, data.logo);
      await this.projectRepository.save(project);
      await this.audit.recordProject({
        action: 'project.updated',
        actorId: ownerUserId,
        authenticationMethod,
        apiTokenId,
        subjectType: 'project',
        subjectId: project.id,
        details: { ...before, ...this.projectDetails(project, 'after'), changedFields: JSON.stringify(['logo']) },
      });
    }
    return project;
  }

  public async deleteOne(
    ownerUserId: number,
    id: number,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<void> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const details = this.projectDetails(project, 'before');
    await this.projectRepository.manager.transaction(async (manager) => {
      await manager.getRepository(ResourceUsage).update({ projectId: id }, { projectId: null });
      const result = await manager.getRepository(Project).delete(id);
      if (result.affected !== 1) throw new NotFoundException('Project not found');
    });
    this.metricsService.projectsTotal.dec();
    await this.audit.recordProject({
      action: 'project.deleted',
      actorId: ownerUserId,
      authenticationMethod,
      apiTokenId,
      subjectType: 'project',
      subjectId: id,
      details,
    });
  }

  public async updateOne(
    ownerUserId: number,
    id: number,
    data: UpdateProjectDto,
    authenticationMethod: 'session' | 'api-token' = 'session',
    apiTokenId?: number,
  ): Promise<Project> {
    const project = await this.projectAccessService.ensureOwner(ownerUserId, id);
    const before = this.projectDetails(project, 'before');
    const beforeName = project.name;
    const beforeDescription = project.description;
    const beforeLogo = project.logo;

    if (data.description !== undefined) {
      project.description = data.description;
    }

    if (data.name !== undefined) {
      project.name = data.name;
    }

    if (data.logo ?? data.deleteLogo) {
      if (project.logo) {
        await this.fileStorageService.deleteFile(`projects/${project.id}`, project.logo);
        project.logo = null;
      }

      if (data.logo) {
        await this.setLogo(project, data.logo);
      }
    }

    const saved = await this.projectRepository.save(project);
    const changedFields = [
      ...(beforeName !== saved.name ? ['name'] : []),
      ...(data.description !== undefined && data.description !== beforeDescription ? ['description'] : []),
      ...(beforeLogo !== saved.logo ? ['logo'] : []),
    ];
    if (changedFields.length) {
      await this.audit.recordProject({
        action: 'project.updated',
        actorId: ownerUserId,
        authenticationMethod,
        apiTokenId,
        subjectType: 'project',
        subjectId: saved.id,
        details: {
          ...before,
          ...this.projectDetails(saved, 'after'),
          ...(data.description !== undefined && data.description !== beforeDescription
            ? { descriptionChanged: 1 }
            : {}),
          changedFields: JSON.stringify(changedFields),
        },
      });
    }
    return saved;
  }
}
