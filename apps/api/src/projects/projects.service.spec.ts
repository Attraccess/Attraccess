import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeleteResult, Repository } from 'typeorm';
import { ProjectsService } from './projects.service';
import { Project } from '@attraccess/database-entities';
import { FileStorageService } from '../common/services/file-storage.service';
import { CreateProjectDto } from './dto/create.dto';
import { FileUpload } from '../common/types/file-upload.types';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { NotFoundException } from '@nestjs/common';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepository: jest.Mocked<Repository<Project>>;
  let fileStorageService: { saveFile: jest.Mock; deleteFile: jest.Mock };

  beforeEach(async () => {
    projectRepository = {
      find: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;

    fileStorageService = {
      saveFile: jest.fn(),
      deleteFile: jest.fn(),
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

  describe('findOneById', () => {
    it('should find one project by id and owner', async () => {
      const project = { id: 10, owner: { id: 7 } } as unknown as Project;
      projectRepository.findOne.mockResolvedValueOnce(project);

      const result = await service.findOneById(7, 10);

      expect(projectRepository.findOne).toHaveBeenCalledWith({
        where: { id: 10, owner: { id: 7 } },
      });
      expect(result).toBe(project);
    });

    it('should throw NotFoundException when project is missing', async () => {
      projectRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.findOneById(7, 10)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getTotalCount', () => {
    it('should count projects filtered by owner', async () => {
      projectRepository.count = jest.fn().mockResolvedValueOnce(42);
      const total = await service.getTotalCount(99);
      expect(projectRepository.count).toHaveBeenCalledWith({ where: { owner: { id: 99 } } });
      expect(total).toBe(42);
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

  describe('deleteOne', () => {
    it('should delete a project by id', async () => {
      projectRepository.delete.mockResolvedValueOnce({} as DeleteResult);

      await service.deleteOne(123);

      expect(projectRepository.delete).toHaveBeenCalledWith(123);
    });
  });

  describe('updateOne', () => {
    it('should throw NotFoundException when project does not exist', async () => {
      projectRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.updateOne(1, 999, { name: 'x' } as UpdateProjectDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should update name and description without touching logo', async () => {
      const existing = { id: 2, name: 'Old', description: 'Old desc', logo: null } as unknown as Project;
      projectRepository.findOne.mockResolvedValueOnce(existing);
      projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const updated = await service.updateOne(1, 2, { name: 'New', description: 'New desc' } as UpdateProjectDto);

      expect(fileStorageService.deleteFile).not.toHaveBeenCalled();
      expect(fileStorageService.saveFile).not.toHaveBeenCalled();
      expect(projectRepository.save).toHaveBeenCalledTimes(1);
      expect(projectRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, name: 'New', description: 'New desc' }),
      );
      expect(updated).toEqual(expect.objectContaining({ id: 2, name: 'New', description: 'New desc' }));
    });

    it('should delete existing logo when deleteLogo is true', async () => {
      const existing = { id: 3, name: 'P', description: 'D', logo: 'old.png' } as unknown as Project;
      projectRepository.findOne.mockResolvedValueOnce(existing);
      projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const result = await service.updateOne(1, 3, { deleteLogo: true } as unknown as UpdateProjectDto);

      expect(fileStorageService.deleteFile).toHaveBeenCalledWith('projects/3', 'old.png');
      expect(fileStorageService.saveFile).not.toHaveBeenCalled();
      expect(projectRepository.save).toHaveBeenCalledTimes(1);
      expect(projectRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, logo: null }));
      expect(result.logo).toBeNull();
    });

    it('should replace existing logo when a new logo is provided', async () => {
      const existing = { id: 4, name: 'P', description: 'D', logo: 'old.png' } as unknown as Project;
      projectRepository.findOne.mockResolvedValueOnce(existing);
      const newLogo = Buffer.from('new') as unknown as FileUpload;
      fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      // First save inside setLogo, second save as final return
      projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const result = await service.updateOne(10, 4, { logo: newLogo } as unknown as UpdateProjectDto);

      expect(fileStorageService.deleteFile).toHaveBeenCalledWith('projects/4', 'old.png');
      expect(fileStorageService.saveFile).toHaveBeenCalledWith(newLogo, 'projects/4');
      expect(projectRepository.save).toHaveBeenCalledTimes(2);
      expect(result.logo).toBe('new.png');
    });

    it('should add logo when none existed previously', async () => {
      const existing = { id: 6, name: 'P', description: 'D', logo: null } as unknown as Project;
      projectRepository.findOne.mockResolvedValueOnce(existing);
      const newLogo = Buffer.from('new') as unknown as FileUpload;
      fileStorageService.saveFile.mockResolvedValueOnce('added.png');
      projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const result = await service.updateOne(10, 6, { logo: newLogo } as unknown as UpdateProjectDto);

      expect(fileStorageService.deleteFile).not.toHaveBeenCalled();
      expect(fileStorageService.saveFile).toHaveBeenCalledWith(newLogo, 'projects/6');
      expect(projectRepository.save).toHaveBeenCalledTimes(2);
      expect(result.logo).toBe('added.png');
    });
  });
});
