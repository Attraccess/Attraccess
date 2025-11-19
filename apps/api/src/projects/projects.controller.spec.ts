import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { AuthenticatedRequest, Project } from '@attraccess/plugins-backend-sdk';
import { NotFoundException } from '@nestjs/common';
import { CreateProjectDto } from './dto/create.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { FileUpload } from '../common/types/file-upload.types';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const projectsService = {
    findMany: jest.fn(),
    getTotalCount: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
  };
  const fileStorageService = {
    getPublicPath: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: FileStorageService, useValue: fileStorageService },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  describe('findMany', () => {
    it('should return data with transformed logos and total from service.getTotalCount', async () => {
      const req = { user: { id: 1 } };
      const query = { page: 2, limit: 5 } as FindManyProjectsQueryDto;
      const projects = [
        { id: 10, name: 'P1', logo: 'logo.png' },
        { id: 11, name: 'P2', logo: null },
      ] as unknown as Project[];
      projectsService.findMany.mockResolvedValueOnce(projects);
      projectsService.getTotalCount.mockResolvedValueOnce(42);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.findMany(req as AuthenticatedRequest, query);

      expect(projectsService.findMany).toHaveBeenCalledWith(1, query);
      expect(projectsService.getTotalCount).toHaveBeenCalledWith(1);
      expect(result.total).toBe(42);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.data).toEqual([
        expect.objectContaining({ id: 10, logo: 'projects/10/logo.png' }),
        expect.objectContaining({ id: 11, logo: null }),
      ]);
    });
  });

  describe('getOne', () => {
    it('should return a transformed project when found', async () => {
      const req = { user: { id: 2 } };
      const project = { id: 20, name: 'Proj', logo: 'logo.png' } as unknown as Project;
      projectsService.findOne.mockResolvedValueOnce(project);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.getOne(req as AuthenticatedRequest, 20);

      expect(projectsService.findOne).toHaveBeenCalledWith({ id: 20, ownerId: 2 });
      expect(result).toEqual(expect.objectContaining({ id: 20, logo: 'projects/20/logo.png' }));
    });

    it('should throw NotFoundException when project is missing', async () => {
      const req = { user: { id: 3 } };
      projectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.getOne(req as AuthenticatedRequest, 999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteOne', () => {
    it('should delete an existing project', async () => {
      const req = { user: { id: 4 } };
      const project = { id: 30, name: 'Del', logo: null } as unknown as Project;
      projectsService.findOne.mockResolvedValueOnce(project);

      await controller.deleteOne(req as AuthenticatedRequest, 30);

      expect(projectsService.findOne).toHaveBeenCalledWith({ id: 30, ownerId: 4 });
      expect(projectsService.deleteOne).toHaveBeenCalledWith(30);
    });

    it('should throw NotFoundException when project to delete is missing', async () => {
      const req = { user: { id: 5 } };
      projectsService.findOne.mockResolvedValueOnce(null);
      await expect(controller.deleteOne(req as AuthenticatedRequest, 123)).rejects.toBeInstanceOf(NotFoundException);
      expect(projectsService.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a project and transform logo when provided', async () => {
      const req = { user: { id: 6 } };
      const data = { name: 'New', description: 'Desc' } as CreateProjectDto;
      const logo = Buffer.from('x') as unknown as FileUpload;
      const created = { id: 40, name: 'New', description: 'Desc', logo: 'logo.png' } as unknown as Project;
      projectsService.create.mockResolvedValueOnce(created);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.create(req as AuthenticatedRequest, { ...data }, logo);

      expect(projectsService.create).toHaveBeenCalledWith(6, expect.objectContaining({ ...data, logo }));
      expect(result).toEqual(expect.objectContaining({ id: 40, logo: 'projects/40/logo.png' }));
    });

    it('should create a project without logo', async () => {
      const req = { user: { id: 7 } };
      const data = { name: 'NoLogo', description: 'D' } as CreateProjectDto;
      const created = { id: 41, name: 'NoLogo', description: 'D', logo: null } as unknown as Project;
      projectsService.create.mockResolvedValueOnce(created);

      const result = await controller.create(req as AuthenticatedRequest, { ...data });

      expect(projectsService.create).toHaveBeenCalledWith(7, expect.objectContaining({ ...data }));
      expect(result.logo).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a project with uploaded logo and transform response', async () => {
      const req = { user: { id: 8 } };
      const id = 55;
      const data = { name: 'Upd', description: 'D' } as UpdateProjectDto;
      const logo = Buffer.from('y') as unknown as FileUpload;
      const updated = { id, name: 'Upd', description: 'D', logo: 'fresh.png' } as unknown as Project;
      projectsService.updateOne.mockResolvedValueOnce(updated);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.update(req as AuthenticatedRequest, id, { ...data }, logo);

      expect(projectsService.updateOne).toHaveBeenCalledWith(8, 55, expect.objectContaining({ ...data, logo }));
      expect(result).toEqual(expect.objectContaining({ id: 55, logo: 'projects/55/fresh.png' }));
    });

    it('should update a project without logo', async () => {
      const req = { user: { id: 9 } };
      const id = 56;
      const data = { name: 'Upd2', description: 'D2' } as UpdateProjectDto;
      const updated = { id, name: 'Upd2', description: 'D2', logo: null } as unknown as Project;
      projectsService.updateOne.mockResolvedValueOnce(updated);

      const result = await controller.update(req as AuthenticatedRequest, id, { ...data });

      expect(projectsService.updateOne).toHaveBeenCalledWith(9, 56, expect.objectContaining({ ...data }));
      expect(result.logo).toBeNull();
    });
  });
});
