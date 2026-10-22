import { ProjectPersistence } from './persistence/port';

import { Test, TestingModule } from '@nestjs/testing';
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

export function registerProjectsServiceFixture() {
  let service: ProjectsService;

  let persistence: jest.Mocked<ProjectPersistence>;

  let fileStorageService: { saveFile: jest.Mock; deleteFile: jest.Mock };

  let projectAccessService: {
    addAccessMetadata: jest.Mock;
    ensureOwner: jest.Mock;
    getAccessOrThrow: jest.Mock;
  };

  let audit: { recordProject: jest.Mock };

  beforeEach(async () => {
    const invitation = jest.fn();
    const membership = jest.fn();
    persistence = {
      accessiblePage: jest.fn(),
      accessibleCount: jest.fn(),
      setArchived: jest.fn(),
      requireProject: jest.fn(),
      members: jest.fn(),
      member: membership,
      membership,
      removeMember: jest.fn(),
      addMember: jest.fn(),
      projectInvitations: jest.fn(),
      pendingInvitations: jest.fn(),
      pendingInvitation: invitation,
      invitationWithRelations: invitation,
      saveInvitation: jest.fn(),
      invite: jest.fn(),
      findUser: jest.fn(),
      createProject: jest.fn(),
      saveProject: jest.fn(),
      deleteWithUsageDetachment: jest.fn(),
    };
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
        { provide: ProjectPersistence, useValue: persistence },
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
    get service() {
      return service;
    },
    get persistence() {
      return persistence;
    },
    get fileStorageService() {
      return fileStorageService;
    },
    get projectAccessService() {
      return projectAccessService;
    },
    get audit() {
      return audit;
    },
  };
}
