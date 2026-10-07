import { Project, ProjectInvitation, ProjectMember, ResourceUsage, User } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectsService } from './projects.service';

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
export function registerProjectsServiceFixture() {
  let service: ProjectsService;

  let projectRepository: jest.Mocked<Repository<Project>>;

  let resourceUsageRepository: jest.Mocked<Repository<ResourceUsage>>;

  let fileStorageService: { saveFile: jest.Mock; deleteFile: jest.Mock };

  let projectAccessService: {
    addAccessMetadata: jest.Mock;
    ensureOwner: jest.Mock;
    getAccessOrThrow: jest.Mock;
  };

  let projectMemberRepository: jest.Mocked<Repository<ProjectMember>>;

  let projectInvitationRepository: jest.Mocked<Repository<ProjectInvitation>>;

  let userRepository: jest.Mocked<Repository<User>>;

  let audit: { recordProject: jest.Mock };

  beforeEach(async () => {
    const queryBuilder = createMockQueryBuilder();
    projectRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findOneByOrFail: jest.fn(),
    } as unknown as jest.Mocked<Repository<Project>>;

    resourceUsageRepository = {
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<ResourceUsage>>;
    Object.assign(projectRepository, {
      manager: {
        transaction: jest.fn(async (work) =>
          work({
            getRepository: (entity: unknown) =>
              entity === ResourceUsage ? resourceUsageRepository : projectRepository,
          }),
        ),
      },
    });

    projectMemberRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<ProjectMember>>;
    projectInvitationRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<ProjectInvitation>>;
    userRepository = { findOne: jest.fn() } as unknown as jest.Mocked<Repository<User>>;
    audit = { recordProject: jest.fn().mockResolvedValue(undefined) };

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
        { provide: getRepositoryToken(ProjectMember), useValue: projectMemberRepository },
        { provide: getRepositoryToken(ProjectInvitation), useValue: projectInvitationRepository },
        { provide: getRepositoryToken(ResourceUsage), useValue: resourceUsageRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: FileStorageService, useValue: fileStorageService },
        { provide: ProjectAccessService, useValue: projectAccessService },
        { provide: EmailService, useValue: { sendProjectInvitationEmail: jest.fn() } },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: NotificationDispatchService, useValue: { dispatch: jest.fn() } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  return {
    get mockMetricsService() {
      return mockMetricsService;
    },
    get createMockQueryBuilder() {
      return createMockQueryBuilder;
    },
    get service() {
      return service;
    },
    get projectRepository() {
      return projectRepository;
    },
    get resourceUsageRepository() {
      return resourceUsageRepository;
    },
    get fileStorageService() {
      return fileStorageService;
    },
    get projectAccessService() {
      return projectAccessService;
    },
    get projectMemberRepository() {
      return projectMemberRepository;
    },
    get projectInvitationRepository() {
      return projectInvitationRepository;
    },
    get userRepository() {
      return userRepository;
    },
    get audit() {
      return audit;
    },
  };
}
