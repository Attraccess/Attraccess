import { Project } from './project';
import { User } from './user';

export enum ProjectMemberRole {
  VIEWER = 'viewer',
}

export interface ProjectMember {
  id: number;
  projectId: number;
  project: Project;
  userId: number;
  user: User;
  role: ProjectMemberRole;
  joinedAt: Date;
}
