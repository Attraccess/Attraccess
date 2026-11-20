import type { TransactionScope, UnitOfWork } from '../database/unit-of-work';
import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { Test, TestingModule } from '@nestjs/testing';
import { UNIT_OF_WORK } from '../database/unit-of-work';
import { FileStorageService } from '../common/services/file-storage.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { ProjectAccessService } from './project-access.service';
import {
  PROJECT_INVITATION_STORE,
  PROJECT_STORE,
  type ProjectInvitationStore,
  type ProjectStore,
} from './project.port';
import { ProjectsService } from './projects.service';

const mockMetricsService = {
  projectsTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};

export type MockedStore<T> = { [K in keyof T]: jest.Mock };

/** A unit of work whose scopes are plain objects; `scopes` lists every scope that was opened. */
export function createFakeUnitOfWork(): UnitOfWork & { scopes: TransactionScope[] } {
  const scopes: TransactionScope[] = [];
  return {
    scopes,
    current: () => undefined,
    run: async (work) => {
      const scope: TransactionScope = { isOpen: true, afterCommit: jest.fn() };
      scopes.push(scope);
      return work(scope);
    },
  };
}

export function registerProjectsServiceFixture() {
  let service: ProjectsService;
  let projects: MockedStore<ProjectStore>;
  let invitationStore: MockedStore<ProjectInvitationStore>;
  let uow: ReturnType<typeof createFakeUnitOfWork>;
  let fileStorageService: { saveFile: jest.Mock; deleteFile: jest.Mock };
  let projectAccessService: { addAccessMetadata: jest.Mock; ensureOwner: jest.Mock; getAccessOrThrow: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    projects = {
      findWithOwner: jest.fn(),
      findOwned: jest.fn(),
      findMembership: jest.fn(),
      findMembershipsOfUser: jest.fn(),
      listAccessible: jest.fn().mockResolvedValue([]),
      countAccessible: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      updateDetails: jest.fn(),
      archive: jest.fn(),
      unarchive: jest.fn(),
      getById: jest.fn(),
      deleteProject: jest.fn(),
      listMembers: jest.fn(),
      findMember: jest.fn(),
      removeMember: jest.fn(),
    };
    invitationStore = {
      listPendingForUser: jest.fn(),
      listForProject: jest.fn(),
      findById: jest.fn(),
      findPending: jest.fn(),
      findInvitee: jest.fn(),
      create: jest.fn(),
      recordResponse: jest.fn(),
      touch: jest.fn(),
      addMemberIfMissing: jest.fn(),
    };
    uow = createFakeUnitOfWork();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    fileStorageService = { saveFile: jest.fn(), deleteFile: jest.fn() };
    projectAccessService = { addAccessMetadata: jest.fn(), ensureOwner: jest.fn(), getAccessOrThrow: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PROJECT_STORE, useValue: projects },
        { provide: PROJECT_INVITATION_STORE, useValue: invitationStore },
        { provide: UNIT_OF_WORK, useValue: uow },
        { provide: FileStorageService, useValue: fileStorageService },
        { provide: ProjectAccessService, useValue: projectAccessService },
        { provide: EmailService, useValue: { sendProjectInvitationEmail: jest.fn() } },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: NotificationDispatchService, useValue: { dispatch: jest.fn() } },
        { provide: AUDIT_RECORDER, useValue: audit },
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
    get projects() {
      return projects;
    },
    get invitationStore() {
      return invitationStore;
    },
    get uow() {
      return uow;
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
