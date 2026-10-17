import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.dto';
import { ResourceUsage } from './resourceUsage.dto';
import { ProjectMember } from './project-member.dto';
import { ProjectInvitation } from './project-invitation.dto';
import type { ResponseFields } from '../response-mapper';

export class Project {
  @ApiProperty({ description: 'The ID of the project' })
  id!: number;

  @ApiProperty({ description: 'The date and time the NFC card was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the NFC card was last updated' })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The date and time the project was archived',
    required: false,
    nullable: true,
  })
  archivedAt!: Date | null;

  @ApiProperty({ description: 'The ID of the user that owns the project', type: () => User })
  owner!: User;

  @ApiProperty({ description: 'The name of the project' })
  name!: string;

  @ApiProperty({ description: 'The description of the project' })
  description!: string | null;

  @ApiProperty({ description: 'The logo of the project' })
  logo!: string | null;

  resourceUsages!: ResourceUsage[];

  @ApiProperty({ description: 'Members that have access to the project', type: () => [ProjectMember] })
  members!: ProjectMember[];

  @ApiProperty({ description: 'Pending invitations for the project', type: () => [ProjectInvitation] })
  invitations!: ProjectInvitation[];
  static readonly responseFields: ResponseFields = {
    id: null,
    createdAt: null,
    updatedAt: null,
    archivedAt: null,
    owner: () => User,
    name: null,
    description: null,
    logo: null,
    resourceUsages: () => ResourceUsage,
    members: () => ProjectMember,
    invitations: () => ProjectInvitation,
  };
}
