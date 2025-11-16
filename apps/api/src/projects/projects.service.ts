import { Project } from '@attraccess/database-entities';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { CreateProjectDto } from './dto/create.dto';
import { FileStorageService } from '../common/services/file-storage.service';
import { UpdateProjectDto } from './dto/update.dto';
import { FileUpload } from '../common/types/file-upload.types';

export interface FindOneSearchOptions {
  id: number;
  ownerId: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly fileStorageService: FileStorageService,
  ) {}

  public async findMany(userId: number, query: FindManyProjectsQueryDto): Promise<Project[]> {
    const { page, limit: take } = query;
    const skip = (page - 1) * take;

    return await this.projectRepository.find({
      where: { owner: { id: userId } },
      skip,
      take,
      order: { name: 'ASC', createdAt: 'DESC' },
    });
  }

  public async findOne(searchOptions: FindOneSearchOptions): Promise<Project> {
    return await this.projectRepository.findOne({
      where: { id: searchOptions.id, owner: { id: searchOptions.ownerId } },
    });
  }

  private async setLogo(project: Project, logo: FileUpload) {
    const logoFilename = await this.fileStorageService.saveFile(logo, `projects/${project.id}`);
    project.logo = logoFilename;
    await this.projectRepository.save(project);
  }

  public async create(ownerUserId: number, data: CreateProjectDto): Promise<Project> {
    const project = await this.projectRepository.save({
      owner: { id: ownerUserId },
      name: data.name,
      description: data.description,
    });

    if (data.logo) {
      await this.setLogo(project, data.logo);
    }

    return project;
  }

  public async deleteOne(id: number): Promise<void> {
    await this.projectRepository.delete(id);
  }

  public async updateOne(ownerUserId: number, id: number, data: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne({ id, ownerId: ownerUserId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (data.description) {
      project.description = data.description;
    }

    if (data.name) {
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

    return await this.projectRepository.save(project);
  }
}
