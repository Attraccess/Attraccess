import type {
  ResourceUsage,
  Project,
  ProjectInvitation,
  ProjectMember,
  ProjectMemberRole,
  User,
} from '@attraccess/application-models';

export abstract class ProjectAccessPersistence {
  abstract ownedProject(userId: number, projectId: number): Promise<Project | null>;
  abstract projectWithOwner(projectId: number): Promise<Project | null>;
  abstract membership(userId: number, projectId: number): Promise<ProjectMember | null>;
  abstract memberships(userId: number, projectIds: readonly number[]): Promise<ProjectMember[]>;
}

export class ProjectDeleteMissing extends Error {}
export abstract class ProjectPersistence {
  abstract accessiblePage(userId: number, page: number, limit: number, includeArchived: boolean): Promise<Project[]>;
  abstract accessibleCount(userId: number, includeArchived: boolean): Promise<number>;
  abstract setArchived(id: number, archivedAt: Date | null): Promise<boolean>;
  abstract requireProject(id: number): Promise<Project>;
  abstract members(projectId: number): Promise<ProjectMember[]>;
  abstract member(projectId: number, memberId: number): Promise<ProjectMember | null>;
  abstract membership(projectId: number, userId: number): Promise<ProjectMember | null>;
  abstract removeMember(id: number): Promise<boolean>;
  abstract addMember(projectId: number, userId: number, role: ProjectMemberRole): Promise<ProjectMember>;
  abstract projectInvitations(projectId: number): Promise<ProjectInvitation[]>;
  abstract pendingInvitations(userId: number): Promise<ProjectInvitation[]>;
  abstract pendingInvitation(projectId: number, userId: number): Promise<ProjectInvitation | null>;
  abstract invitationWithRelations(id: number): Promise<ProjectInvitation | null>;
  abstract saveInvitation(invitation: ProjectInvitation): Promise<void>;
  abstract invite(
    projectId: number,
    ownerId: number,
    invitedUserId: number,
    role: ProjectMemberRole,
  ): Promise<ProjectInvitation>;
  abstract findUser(id: number): Promise<User | null>;
  abstract createProject(ownerId: number, name: string, description: string): Promise<Project>;
  abstract saveProject(project: Project): Promise<Project>;
  /** Detach historical usages and delete together, or roll both back. */
  abstract deleteWithUsageDetachment(id: number): Promise<void>;
}

export type UsageSummaryRaw = {
  totalSessions: string | null;
  totalMinutes: string | null;
};

export type SpendRaw = {
  totalSpend: string | null;
};

export type TimeSeriesUsageRaw = {
  usageDate: string;
  sessions: string;
  minutes: string;
};

export type TimeSeriesSpendRaw = {
  usageDate: string;
  spend: string;
};

export type ResourceUsageAggregateRaw = {
  resourceId: string;
  resourceName: string | null;
  sessions: string;
  minutes: string;
};

export type ResourceSpendAggregateRaw = {
  resourceId: string;
  spend: string;
};

export interface ProjectReportWindow {
  startDate?: Date;
  endDate?: Date;
}
export interface ProjectUsageAggregates {
  summaryRaw: UsageSummaryRaw;
  perResourceUsageRaw: ResourceUsageAggregateRaw[];
  timeSeriesUsageRaw: TimeSeriesUsageRaw[];
  totalSpendRaw: SpendRaw;
  perResourceSpendRaw: ResourceSpendAggregateRaw[];
  timeSeriesSpendRaw: TimeSeriesSpendRaw[];
}
export abstract class ProjectUsagePersistence {
  abstract historyPage(
    projectId: number,
    page: number,
    limit: number,
    window: ProjectReportWindow,
  ): Promise<[ResourceUsage[], number]>;
  abstract statistics(projectId: number, window: ProjectReportWindow): Promise<ProjectUsageAggregates>;
  abstract billingCurrency(): Promise<string | null>;
}
