import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { AuthenticatedRequest, Project, ProjectMember, User } from '@attraccess/plugins-backend-sdk';
import { NotFoundException } from '@nestjs/common';
import { CreateProjectDto } from './dto/create.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { FileUpload } from '../common/types/file-upload.types';
import { ProjectUsageService } from './project-usage.service';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectAccessService } from './project-access.service';
import { ProjectWithAccessDto } from './dto/project-access.dto';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const projectsService = {
    findMany: jest.fn(),
    getTotalCount: jest.fn(),
    findOneById: jest.fn(),
    deleteOne: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    listMembers: jest.fn(),
    removeMember: jest.fn(),
    listProjectInvitations: jest.fn(),
    createProjectInvitation: jest.fn(),
    resendProjectInvitation: jest.fn(),
    cancelProjectInvitation: jest.fn(),
    listPendingInvitationsForUser: jest.fn(),
    acceptInvitation: jest.fn(),
    declineInvitation: jest.fn(),
  };
  const fileStorageService = {
    getPublicPath: jest.fn(),
  };
  const projectUsageService = {
    getProjectUsageHistory: jest.fn(),
    getProjectUsageStats: jest.fn(),
  };
  const projectAccessService = {
    getAccessOrThrow: jest.fn(),
    addAccessMetadata: jest.fn(),
    ensureOwner: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: FileStorageService, useValue: fileStorageService },
        { provide: ProjectUsageService, useValue: projectUsageService },
        { provide: ProjectAccessService, useValue: projectAccessService },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  describe('findMany', () => {
    it('should return data with transformed logos and total from service.getTotalCount', async () => {
      const req = { user: { id: 1 } };
      const query = { page: 2, limit: 5 } as FindManyProjectsQueryDto;
      const projects = [
        { id: 10, name: 'P1', logo: 'logo.png', access: { isOwner: true, role: null, canManageProject: true } },
        { id: 11, name: 'P2', logo: null, access: { isOwner: false, role: null, canManageProject: false } },
      ] as unknown as ProjectWithAccessDto[];
      projectsService.findMany.mockResolvedValueOnce(projects);
      projectsService.getTotalCount.mockResolvedValueOnce(42);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.findMany(req as AuthenticatedRequest, query);

      expect(projectsService.findMany).toHaveBeenCalledWith(1, query);
      expect(projectsService.getTotalCount).toHaveBeenCalledWith(1, query);
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
      const project = {
        id: 20,
        name: 'Proj',
        logo: 'logo.png',
        access: { isOwner: true, role: null, canManageProject: true },
      } as unknown as ProjectWithAccessDto;
      projectAccessService.getAccessOrThrow.mockResolvedValueOnce(project);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.getOne(req as AuthenticatedRequest, 20);

      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(2, 20);
      expect(result).toEqual(expect.objectContaining({ id: 20, logo: 'projects/20/logo.png' }));
    });

    it('should throw NotFoundException when project is missing', async () => {
      const req = { user: { id: 3 } };
      projectAccessService.getAccessOrThrow.mockRejectedValueOnce(new NotFoundException());
      await expect(controller.getOne(req as AuthenticatedRequest, 999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteOne', () => {
    it('should delete an existing project', async () => {
      const req = { user: { id: 4 } };
      projectAccessService.ensureOwner.mockResolvedValueOnce({ id: 30 } as Project);

      await controller.deleteOne(req as AuthenticatedRequest, 30);

      expect(projectAccessService.ensureOwner).toHaveBeenCalledWith(4, 30);
      expect(projectsService.deleteOne).toHaveBeenCalledWith(30);
    });

    it('should throw NotFoundException when project to delete is missing', async () => {
      const req = { user: { id: 5 } };
      projectAccessService.ensureOwner.mockRejectedValueOnce(new NotFoundException());
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
      const createdWithAccess = {
        ...created,
        access: { isOwner: true, role: null, canManageProject: true },
      } as unknown as ProjectWithAccessDto;
      projectsService.create.mockResolvedValueOnce(created);
      projectAccessService.getAccessOrThrow.mockResolvedValueOnce(createdWithAccess);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.create(req as AuthenticatedRequest, { ...data }, logo);

      expect(projectsService.create).toHaveBeenCalledWith(6, expect.objectContaining({ ...data, logo }));
      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(6, 40);
      expect(result).toEqual(expect.objectContaining({ id: 40, logo: 'projects/40/logo.png' }));
    });

    it('should create a project without logo', async () => {
      const req = { user: { id: 7 } };
      const data = { name: 'NoLogo', description: 'D' } as CreateProjectDto;
      const created = { id: 41, name: 'NoLogo', description: 'D', logo: null } as unknown as Project;
      const createdWithAccess = {
        ...created,
        access: { isOwner: true, role: null, canManageProject: true },
      } as unknown as ProjectWithAccessDto;
      projectsService.create.mockResolvedValueOnce(created);
      projectAccessService.getAccessOrThrow.mockResolvedValueOnce(createdWithAccess);

      const result = await controller.create(req as AuthenticatedRequest, { ...data });

      expect(projectsService.create).toHaveBeenCalledWith(7, expect.objectContaining({ ...data }));
      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(7, 41);
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
      const updatedWithAccess = {
        ...updated,
        access: { isOwner: true, role: null, canManageProject: true },
      } as unknown as ProjectWithAccessDto;
      projectsService.updateOne.mockResolvedValueOnce(updated);
      projectAccessService.getAccessOrThrow.mockResolvedValueOnce(updatedWithAccess);
      fileStorageService.getPublicPath.mockImplementation((base: string, filename: string) => `${base}/${filename}`);

      const result = await controller.update(req as AuthenticatedRequest, id, { ...data }, logo);

      expect(projectsService.updateOne).toHaveBeenCalledWith(8, 55, expect.objectContaining({ ...data, logo }));
      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(8, 55);
      expect(result).toEqual(expect.objectContaining({ id: 55, logo: 'projects/55/fresh.png' }));
    });

    it('should update a project without logo', async () => {
      const req = { user: { id: 9 } };
      const id = 56;
      const data = { name: 'Upd2', description: 'D2' } as UpdateProjectDto;
      const updated = { id, name: 'Upd2', description: 'D2', logo: null } as unknown as Project;
      const updatedWithAccess = {
        ...updated,
        access: { isOwner: true, role: null, canManageProject: true },
      } as unknown as ProjectWithAccessDto;
      projectsService.updateOne.mockResolvedValueOnce(updated);
      projectAccessService.getAccessOrThrow.mockResolvedValueOnce(updatedWithAccess);

      const result = await controller.update(req as AuthenticatedRequest, id, { ...data });

      expect(projectsService.updateOne).toHaveBeenCalledWith(9, 56, expect.objectContaining({ ...data }));
      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(9, 56);
      expect(result.logo).toBeNull();
    });
  });

  describe('getUsageHistory', () => {
    it('should validate ownership and return usage history', async () => {
      const req = { user: { id: 10 } };
      const query = { page: 1, limit: 10 } as GetProjectUsageHistoryQueryDto;
      const history = { data: [], total: 0, page: 1, limit: 10 };
      projectUsageService.getProjectUsageHistory.mockResolvedValueOnce(history);

      const result = await controller.getUsageHistory(req as AuthenticatedRequest, 99, query);

      expect(projectUsageService.getProjectUsageHistory).toHaveBeenCalledWith(10, 99, query);
      expect(result).toEqual(history);
    });
  });

  describe('getUsageStats', () => {
    it('should validate ownership and return usage stats', async () => {
      const req = { user: { id: 11 } };
      const query = {} as ProjectUsageStatsQueryDto;
      const stats = {
        summary: { totalSessions: 1, totalMinutes: 10, totalSpend: 100, currency: 'EUR', minorUnit: 2 },
        timeSeries: [],
        topResources: [],
      };
      projectUsageService.getProjectUsageStats.mockResolvedValueOnce(stats);

      const result = await controller.getUsageStats(req as AuthenticatedRequest, 77, query);

      expect(projectUsageService.getProjectUsageStats).toHaveBeenCalledWith(11, 77, query);
      expect(result).toEqual(stats);
    });
  });

  describe('listMembers', () => {
    it('returns owner and members', async () => {
      const req = { user: { id: 1 } };
      const owner = { id: 1 } as unknown as User;
      const members = [{ id: 1, projectId: 2 }] as unknown as ProjectMember[];
      projectAccessService.ensureOwner.mockResolvedValueOnce({ owner });
      projectsService.listMembers.mockResolvedValueOnce(members);

      const result = await controller.listMembers(req as AuthenticatedRequest, 2);

      expect(projectAccessService.ensureOwner).toHaveBeenCalledWith(1, 2);
      expect(projectsService.listMembers).toHaveBeenCalledWith(2);
      expect(result).toEqual({ owner, members });
    });
  });

  describe('createInvitation', () => {
    it('creates an invitation via the service', async () => {
      const req = { user: { id: 12 } };
      const invitation = { id: 5 };
      projectsService.createProjectInvitation.mockResolvedValueOnce(invitation);

      const result = await controller.createInvitation(req as AuthenticatedRequest, 3, { invitedUserId: 99 });

      expect(projectsService.createProjectInvitation).toHaveBeenCalledWith(12, 3, 99, undefined);
      expect(result).toBe(invitation);
    });
  });
});
