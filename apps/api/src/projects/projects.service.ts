import { Project } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { CreateProjectDto } from './dto/create.dto';
import { FileStorageService } from '../common/services/file-storage.service';

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

  public async create(ownerUserId: number, data: CreateProjectDto): Promise<Project> {
    const project = await this.projectRepository.save({
      owner: { id: ownerUserId },
      name: data.name,
      description: data.description,
    });

    if (data.logo) {
      const logoFilename = await this.fileStorageService.saveFile(data.logo, `projects/${project.id}`);
      project.logo = logoFilename;
      await this.projectRepository.save(project);
    }

    return project;
  }
}
