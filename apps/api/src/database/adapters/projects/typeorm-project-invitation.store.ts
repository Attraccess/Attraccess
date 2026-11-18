import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ProjectInvitationStatus,
  type ProjectInvitationRecord,
  type ProjectMemberRecord,
  type ProjectMemberRole,
  type UserContact,
} from '@attraccess/application-models';
import { ProjectInvitation, ProjectMember, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { isUniqueViolation } from '../../persistence-errors';
import type { ProjectInvitationStore } from '../../../projects/project.port';
import { toUserContact } from '../users/user-mapping';
import { toProjectInvitationRecord, toProjectMemberRecord } from './project-mapping';

const INVITATION_RELATIONS = { invitedUser: true, inviter: true, project: { owner: true } } as const;

@Injectable()
export class TypeOrmProjectInvitationStore implements ProjectInvitationStore {
  constructor(
    @InjectRepository(ProjectInvitation) private readonly invitations: Repository<ProjectInvitation>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async listPendingForUser(userId: number): Promise<ProjectInvitationRecord[]> {
    const invitations = await this.invitations.find({
      where: { invitedUser: { id: userId }, status: ProjectInvitationStatus.PENDING },
      relations: INVITATION_RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return invitations.map(toProjectInvitationRecord);
  }

  async listForProject(projectId: number): Promise<ProjectInvitationRecord[]> {
    const invitations = await this.invitations.find({
      where: { project: { id: projectId } },
      relations: INVITATION_RELATIONS,
      order: { createdAt: 'DESC' },
    });
    return invitations.map(toProjectInvitationRecord);
  }

  async findById(invitationId: number): Promise<ProjectInvitationRecord | null> {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId },
      relations: INVITATION_RELATIONS,
    });
    return invitation ? toProjectInvitationRecord(invitation) : null;
  }

  async findPending(projectId: number, invitedUserId: number): Promise<ProjectInvitationRecord | null> {
    const invitation = await this.invitations.findOne({
      where: {
        project: { id: projectId },
        invitedUser: { id: invitedUserId },
        status: ProjectInvitationStatus.PENDING,
      },
    });
    return invitation ? toProjectInvitationRecord(invitation) : null;
  }

  async findInvitee(userId: number): Promise<UserContact | null> {
    const user = await this.users.findOne({ where: { id: userId } });
    return user ? toUserContact(user) : null;
  }

  async create(invitation: {
    projectId: number;
    inviterId: number;
    invitedUserId: number;
    requestedRole: ProjectMemberRole;
  }): Promise<ProjectInvitationRecord> {
    const saved = await this.invitations.save({
      project: { id: invitation.projectId },
      inviter: { id: invitation.inviterId },
      invitedUser: { id: invitation.invitedUserId },
      status: ProjectInvitationStatus.PENDING,
      requestedRole: invitation.requestedRole,
    });
    return toProjectInvitationRecord(await this.invitations.findOneByOrFail({ id: saved.id }));
  }

  async recordResponse(invitationId: number, status: ProjectInvitationStatus, respondedAt: Date): Promise<void> {
    await this.invitations.save({ id: invitationId, status, respondedAt });
  }

  async touch(invitationId: number, updatedAt: Date): Promise<void> {
    await this.invitations.save({ id: invitationId, updatedAt });
  }

  async addMemberIfMissing(
    projectId: number,
    userId: number,
    role: ProjectMemberRole,
  ): Promise<ProjectMemberRecord | null> {
    const existing = await this.members.findOne({ where: { project: { id: projectId }, user: { id: userId } } });
    if (existing) return null;
    try {
      const saved = await this.members.save({ project: { id: projectId }, user: { id: userId }, role });
      return toProjectMemberRecord(await this.members.findOneByOrFail({ id: saved.id }));
    } catch (error) {
      // A concurrent acceptance added the membership between the check and the insert.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }
}
