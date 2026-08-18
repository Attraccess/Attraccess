import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectsService } from './projects.service';
import { Project, ProjectInvitation, ProjectMember, ResourceUsage, User } from '@attraccess/database-entities';
import { FileStorageService } from '../common/services/file-storage.service';
import { CreateProjectDto } from './dto/create.dto';
import { FileUpload } from '../common/types/file-upload.types';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { ProjectAccessService } from './project-access.service';
import { EmailService } from '../email/email.service';
import { NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';

const mockMetricsService = {
  projectsTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

type MockQueryBuilder = {
  leftJoinAndSelect: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getCount: jest.Mock;
};

const createMockQueryBuilder = (): MockQueryBuilder => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
  getCount: jest.fn().mockResolvedValue(0),
});

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let resourceUsageRepository: jest.Mocked<Repository<ResourceUsage>>;
  let fileStorageService: { saveFile: jest.Mock; deleteFile: jest.Mock };
  let projectAccessService: {
    addAccessMetadata: jest.Mock;
    ensureOwner: jest.Mock;
    getAccessOrThrow: jest.Mock;
  };

  beforeEach(async () => {
    const queryBuilder = createMockQueryBuilder();
    projectRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;

    resourceUsageRepository = {
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<ResourceUsage>>;

    fileStorageService = {
      saveFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    projectAccessService = {
      addAccessMetadata: jest.fn(),
      ensureOwner: jest.fn(),
      getAccessOrThrow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepository },
        { provide: getRepositoryToken(ProjectMember), useValue: {} },
        { provide: getRepositoryToken(ProjectInvitation), useValue: {} },
        { provide: getRepositoryToken(ResourceUsage), useValue: resourceUsageRepository },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn().mockResolvedValue({ id: 2, userType: 'member' }) } },
        { provide: FileStorageService, useValue: fileStorageService },
        { provide: ProjectAccessService, useValue: projectAccessService },
        { provide: EmailService, useValue: { sendProjectInvitationEmail: jest.fn() } },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: NotificationDispatchService, useValue: { dispatch: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findMany', () => {
    it('returns projects with access metadata', async () => {
      const qb = createMockQueryBuilder();
      qb.getMany.mockResolvedValueOnce([{ id: 1 } as Project]);
      (projectRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);
      projectAccessService.addAccessMetadata.mockResolvedValueOnce([{ id: 1, access: { isOwner: true } }]);

      const result = await service.findMany(5, { page: 2, limit: 10 } as FindManyProjectsQueryDto);

      expect(projectRepository.createQueryBuilder).toHaveBeenCalledWith('project');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('project.owner', 'owner');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.members', 'member', 'member.userId = :userId', { userId: 5 });
      expect(qb.andWhere).toHaveBeenCalledWith('project.archivedAt IS NULL');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(projectAccessService.addAccessMetadata).toHaveBeenCalledWith(5, [{ id: 1 }]);
      expect(result).toEqual([{ id: 1, access: { isOwner: true } }]);
    });
  });

  describe('getTotalCount', () => {
    it('counts accessible projects for the user', async () => {
      const qb = createMockQueryBuilder();
      qb.getCount.mockResolvedValueOnce(7);
      (projectRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);

      const total = await service.getTotalCount(3);

      expect(projectRepository.createQueryBuilder).toHaveBeenCalledWith('project');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.owner', 'owner');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.members', 'member', 'member.userId = :userId', { userId: 3 });
      expect(qb.andWhere).toHaveBeenCalledWith('project.archivedAt IS NULL');
      expect(total).toBe(7);
    });
  });

  describe('findOneById', () => {
    it('delegates to ProjectAccessService', async () => {
      const project = { id: 9 } as Project;
      projectAccessService.getAccessOrThrow.mockResolvedValueOnce(project);

      const result = await service.findOneById(1, 9);

      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(1, 9);
      expect(result).toBe(project);
    });
  });

  describe('create', () => {
    it('creates a project without logo', async () => {
      const payload = { name: 'New', description: 'Desc' } as CreateProjectDto;
      projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 1, ...entity }));

      const created = await service.create(2, payload);

      expect(projectRepository.save).toHaveBeenCalledWith(expect.objectContaining(payload));
      expect(created).toEqual(expect.objectContaining({ id: 1, name: 'New' }));
      expect(fileStorageService.saveFile).not.toHaveBeenCalled();
    });

    it('stores the logo when provided', async () => {
      const payload = {
        name: 'New',
        description: 'Desc',
        logo: Buffer.from('x') as unknown as FileUpload,
      } as CreateProjectDto;
      projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 4, ...entity }));
      fileStorageService.saveFile.mockResolvedValueOnce('logo.png');
      projectRepository.save.mockImplementationOnce(async (entity: Project) => entity);

      const created = await service.create(2, payload);

      expect(fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/4');
      expect(created.logo).toBe('logo.png');
    });
  });

  describe('deleteOne', () => {
    it('unlinks resource usage entries before deleting the project', async () => {
      resourceUsageRepository.update.mockResolvedValue({} as never);

      await service.deleteOne(99);

      expect(resourceUsageRepository.update).toHaveBeenCalledWith({ projectId: 99 }, { projectId: null });
      expect(projectRepository.delete).toHaveBeenCalledWith(99);
    });
  });

  describe('updateOne', () => {
    it('throws when the project is missing', async () => {
      projectAccessService.ensureOwner.mockRejectedValueOnce(new NotFoundException());
      await expect(service.updateOne(1, 1, {} as UpdateProjectDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates fields when project exists', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: null } as Project;
      projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const updated = await service.updateOne(1, 3, { name: 'New' } as UpdateProjectDto);

      expect(projectRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, name: 'New' }));
      expect(updated.name).toBe('New');
    });

    it('replaces logos when requested', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: 'old.png' } as Project;
      const payload = { logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const result = await service.updateOne(1, 3, payload);

      expect(fileStorageService.deleteFile).toHaveBeenCalledWith('projects/3', 'old.png');
      expect(fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/3');
      expect(result.logo).toBe('new.png');
    });
  });
});
