import { User } from './user';
import { ResourceUsage } from './resourceUsage';
import { ProjectMember } from './project-member';
import { ProjectInvitation } from './project-invitation';

export interface Project {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  owner: User;
  name: string;
  description: string | null;
  logo: string | null;
  resourceUsages: ResourceUsage[];
  members: ProjectMember[];
  invitations: ProjectInvitation[];
}
