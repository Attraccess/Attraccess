import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectsService } from './projects.service';
import { Project } from '@attraccess/database-entities';
import { FileStorageService } from '../common/services/file-storage.service';
import { CreateProjectDto } from './dto/create.dto';
import { FileUpload } from '../common/types/file-upload.types';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let fileStorageService: { saveFile: jest.Mock };

  beforeEach(async () => {
    projectRepository = {
      find: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;

    fileStorageService = {
      saveFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: getRepositoryToken(Project),
          useValue: projectRepository,
        },
        {
          provide: FileStorageService,
          useValue: fileStorageService,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findMany', () => {
    it('should query projects with correct pagination, owner filter and ordering', async () => {
      const userId = 42;
      const query = { page: 2, limit: 10 } as FindManyProjectsQueryDto;
      const expectedSkip = 10;
      const expectedTake = 10;
      const projects: Project[] = [{ id: 1, name: 'A', createdAt: new Date(), updatedAt: new Date() } as Project];
      projectRepository.find.mockResolvedValueOnce(projects);

      const result = await service.findMany(userId, query);

      expect(projectRepository.find).toHaveBeenCalledWith({
        where: { owner: { id: userId } },
        skip: expectedSkip,
        take: expectedTake,
        order: { name: 'ASC', createdAt: 'DESC' },
      });
      expect(result).toBe(projects);
    });
  });

  describe('create', () => {
    it('should create a project without logo and persist once', async () => {
      const ownerUserId = 7;
      const data = { name: 'Project Name', description: 'Project Description' } as CreateProjectDto;

      projectRepository.save.mockImplementationOnce(async (entity: Project) => ({
        id: 1,
        ...entity,
      }));

      const created = await service.create(ownerUserId, data);

      expect(projectRepository.save).toHaveBeenCalledTimes(1);
      expect(projectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: { id: ownerUserId },
          name: data.name,
          description: data.description,
        }),
      );
      expect(fileStorageService.saveFile).not.toHaveBeenCalled();
      expect(created).toEqual(
        expect.objectContaining({
          id: 1,
          owner: { id: ownerUserId },
          name: data.name,
          description: data.description,
        }),
      );
    });

    it('should create a project with logo, store file and persist twice', async () => {
      const ownerUserId = 8;
      const logoPayload = Buffer.from('fake-bytes') as unknown as FileUpload;
      const data = { name: 'With Logo', description: 'Desc', logo: logoPayload } as CreateProjectDto;

      // First save returns the newly created project with an id
      projectRepository.save.mockImplementationOnce(async (entity: Project) => ({
        id: 5,
        ...entity,
      }));
      // Second save returns the updated project (with logo assigned)
      projectRepository.save.mockImplementationOnce(async (entity: Project) => entity);
      fileStorageService.saveFile.mockResolvedValueOnce('logo-file.png');

      const created = await service.create(ownerUserId, data);

      expect(projectRepository.save).toHaveBeenCalledTimes(2);
      // First save: initial project data
      expect(projectRepository.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          owner: { id: ownerUserId },
          name: data.name,
          description: data.description,
        }),
      );
      // File saved with the generated project id
      expect(fileStorageService.saveFile).toHaveBeenCalledTimes(1);
      expect(fileStorageService.saveFile).toHaveBeenCalledWith(logoPayload, 'projects/5');
      // Second save: project augmented with logo
      expect(projectRepository.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          id: 5,
          logo: 'logo-file.png',
        }),
      );
      expect(created).toEqual(
        expect.objectContaining({
          id: 5,
          owner: { id: ownerUserId },
          name: data.name,
          description: data.description,
          logo: 'logo-file.png',
        }),
      );
    });
  });
});
