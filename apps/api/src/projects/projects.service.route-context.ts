import {
  Project,
  ProjectInvitation,
  ProjectInvitationStatus,
  ProjectMember,
  ProjectMemberRole,
  User,
} from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { FileUpload } from '../common/types/file-upload.types';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { ProjectAccessService } from './project-access.service';

export abstract class ProjectsServiceRouteContext {
  protected abstract readonly fileStorageService: FileStorageService;
  protected abstract readonly projectRepository: Repository<Project>;
  protected abstract readonly audit: AuditService;
  protected abstract projectDetails(project: Project, state: 'before' | 'after'): Record<string, string | number>;
  protected abstract readonly metricsService: MetricsService;
  protected abstract setLogo(project: Project, logo: FileUpload): Promise<void>;
  protected abstract readonly projectAccessService: ProjectAccessService;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract readonly projectMemberRepository: Repository<ProjectMember>;
  protected abstract readonly projectInvitationRepository: Repository<ProjectInvitation>;
  protected abstract getInvitationWithRelations(invitationId: number): Promise<ProjectInvitation>;
  protected abstract dispatchProjectInvitationNotification(
    invitedUser: User,
    project: Project,
    invitation: ProjectInvitation,
  ): Promise<void>;
  protected abstract invitationDetails(invitation: ProjectInvitation): Record<string, string | number>;
  protected abstract respondToInvitation(
    userId: number,
    invitationId: number,
    status: ProjectInvitationStatus,
    authenticationMethod: 'session' | 'api-token',
    apiTokenId?: number,
  ): Promise<ProjectInvitation>;
  protected abstract ensureMemberRecord(
    projectId: number,
    userId: number,
    role?: ProjectMemberRole,
  ): Promise<ProjectMember | null>;
  protected abstract readonly notifications: NotificationDispatchService;
  protected abstract readonly emailService: EmailService;
}
