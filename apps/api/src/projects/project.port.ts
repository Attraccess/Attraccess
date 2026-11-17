import type {
  AccessibleProjectsQuery,
  ProjectDetailsUpdate,
  ProjectInvitationRecord,
  ProjectInvitationStatus,
  ProjectMemberRecord,
  ProjectMemberRole,
  ProjectRecord,
  ProjectUsageAggregates,
  ProjectUsageDateRange,
  ProjectUsageHistoryEntry,
  UserContact,
} from '@attraccess/application-models';
import type { TransactionScope } from '../database/unit-of-work';

/** Projects, their owner, members and access lookups. Reads return the project with its owner loaded. */
export interface ProjectStore {
  findWithOwner(projectId: number): Promise<ProjectRecord | null>;
  /** The project when `userId` owns it. */
  findOwned(userId: number, projectId: number): Promise<ProjectRecord | null>;
  findMembership(projectId: number, userId: number): Promise<ProjectMemberRecord | null>;
  /** The memberships of one user within the given projects. */
  findMembershipsOfUser(userId: number, projectIds: number[]): Promise<ProjectMemberRecord[]>;
  /** Projects the user owns or is a member of, by name then newest first. `page` is 1-based. */
  listAccessible(
    userId: number,
    query: AccessibleProjectsQuery & { page: number; limit: number },
  ): Promise<ProjectRecord[]>;
  countAccessible(userId: number, query: AccessibleProjectsQuery): Promise<number>;
  create(project: { ownerId: number; name: string; description: string | null }): Promise<ProjectRecord>;
  updateDetails(projectId: number, details: ProjectDetailsUpdate): Promise<ProjectRecord>;
  /** Sets the archive timestamp when the project is not archived yet. False when it already was (or is gone). */
  archive(projectId: number, archivedAt: Date): Promise<boolean>;
  /** Clears the archive timestamp when the project is archived. False when it was not. */
  unarchive(projectId: number): Promise<boolean>;
  /** Throws when the project does not exist. */
  getById(projectId: number): Promise<ProjectRecord>;
  /** Detaches the project's usage sessions and deletes the project in `scope`. False when no project was deleted. */
  deleteProject(projectId: number, scope: TransactionScope): Promise<boolean>;
  listMembers(projectId: number): Promise<ProjectMemberRecord[]>;
  findMember(projectId: number, memberId: number): Promise<ProjectMemberRecord | null>;
  /** True when a membership row was removed. */
  removeMember(memberId: number): Promise<boolean>;
}

export const PROJECT_STORE = Symbol.for('attraccess.projects.project-store');

/** Invitations of users to projects. Reads load the project (with owner), inviter and invited user. */
export interface ProjectInvitationStore {
  listPendingForUser(userId: number): Promise<ProjectInvitationRecord[]>;
  listForProject(projectId: number): Promise<ProjectInvitationRecord[]>;
  findById(invitationId: number): Promise<ProjectInvitationRecord | null>;
  findPending(projectId: number, invitedUserId: number): Promise<ProjectInvitationRecord | null>;
  findInvitee(userId: number): Promise<UserContact | null>;
  create(invitation: {
    projectId: number;
    inviterId: number;
    invitedUserId: number;
    requestedRole: ProjectMemberRole;
  }): Promise<ProjectInvitationRecord>;
  recordResponse(invitationId: number, status: ProjectInvitationStatus, respondedAt: Date): Promise<void>;
  touch(invitationId: number, updatedAt: Date): Promise<void>;
  /** Adds the membership unless the user already is a member. Null when it already existed. */
  addMemberIfMissing(projectId: number, userId: number, role: ProjectMemberRole): Promise<ProjectMemberRecord | null>;
}

export const PROJECT_INVITATION_STORE = Symbol.for('attraccess.projects.invitation-store');

/** Usage history and statistics of a project. */
export interface ProjectUsageStore {
  listUsageHistory(
    projectId: number,
    range: ProjectUsageDateRange,
    page: { page: number; limit: number },
  ): Promise<{ data: ProjectUsageHistoryEntry[]; total: number }>;
  readAggregates(projectId: number, range: ProjectUsageDateRange): Promise<ProjectUsageAggregates>;
  /** The configured billing currency code, null when none is set. */
  readBillingCurrency(): Promise<string | null>;
}

export const PROJECT_USAGE_STORE = Symbol.for('attraccess.projects.usage-store');
