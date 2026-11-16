import type { ProjectInvitationStatus } from './project-invitation';
import type { ProjectMemberRole } from './project-member';
import type { UserContact, UserProfile } from './user-record';

export interface ProjectRecord {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  name: string;
  description: string | null;
  logo: string | null;
  /** Loaded with the owner for every read the application makes. */
  owner?: UserProfile;
}

export interface ProjectMemberRecord {
  id: number;
  projectId: number;
  userId: number;
  role: ProjectMemberRole;
  joinedAt: Date;
  user?: UserProfile;
}

export interface ProjectInvitationRecord {
  id: number;
  projectId: number;
  inviterId: number;
  invitedUserId: number;
  status: ProjectInvitationStatus;
  requestedRole: ProjectMemberRole;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project?: ProjectRecord;
  inviter?: UserContact;
  invitedUser?: UserContact;
}

export interface AccessibleProjectsQuery {
  includeArchived?: boolean;
  search?: string;
}

export interface ProjectDetailsUpdate {
  name: string;
  description: string | null;
  logo: string | null;
}

export interface ProjectUsageDateRange {
  startDate?: Date;
  endDate?: Date;
}

/** A session of a project as the usage history shows it (the serialized session with its user and resource). */
export type ProjectUsageHistoryEntry = Readonly<Record<string, unknown>> & { id: number };

export interface ProjectUsageAggregates {
  summary: { totalSessions: number; totalMinutes: number };
  perResource: Array<{ resourceId: number; resourceName: string | null; sessions: number; minutes: number }>;
  timeSeries: Array<{ date: string; sessions: number; minutes: number }>;
  /** Completed sessions; machine minutes are merged in application code. */
  sessions: Array<{ resourceId: number; startTime: Date; endTime: Date | null }>;
  spend: {
    total: number;
    perResource: Array<{ resourceId: number; spend: number }>;
    timeSeries: Array<{ date: string; spend: number }>;
  };
}
