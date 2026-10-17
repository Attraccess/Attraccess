import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';
import {
  Project,
  entities,
  ProjectInvitation,
  ProjectMember,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { CreateProjectDto } from './dto/create.dto';
import { FileUpload } from './../common/types/file-upload.types';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { DataSource } from 'typeorm';
import { ProjectsService } from './projects.service';
import { FileStorageService } from './../common/services/file-storage.service';
import { ProjectAccessService } from './project-access.service';
import { EmailService } from './../email/email.service';
import { NotFoundException } from '@nestjs/common';
import { MetricsService } from './../metrics/metrics.service';
import { NotificationDispatchService } from './../notifications/notification-dispatch.service';
import { AuditService } from './../audit/audit.service';
import { UpdateProjectDto } from './dto/update.dto';

describe('ProjectsService', () => {
  const fixture = registerProjectsServiceFixture();

  describe('findMany', () => {
    it('returns projects with access metadata', async () => {
      const qb = fixture.createMockQueryBuilder();
      qb.getMany.mockResolvedValueOnce([{ id: 1 } as Project]);
      (fixture.projectRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);
      fixture.projectAccessService.addAccessMetadata.mockResolvedValueOnce([{ id: 1, access: { isOwner: true } }]);

      const result = await fixture.service.findMany(5, { page: 2, limit: 10 } as FindManyProjectsQueryDto);

      expect(fixture.projectRepository.createQueryBuilder).toHaveBeenCalledWith('project');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('project.owner', 'owner');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.members', 'member', 'member.userId = :userId', { userId: 5 });
      expect(qb.andWhere).toHaveBeenCalledWith('project.archivedAt IS NULL');
      expect(qb.skip).toHaveBeenCalledWith(10);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(fixture.projectAccessService.addAccessMetadata).toHaveBeenCalledWith(5, [{ id: 1 }]);
      expect(result).toEqual([{ id: 1, access: { isOwner: true } }]);
    });
  });

  describe('getTotalCount', () => {
    it('counts accessible projects for the user', async () => {
      const qb = fixture.createMockQueryBuilder();
      qb.getCount.mockResolvedValueOnce(7);
      (fixture.projectRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(qb);

      const total = await fixture.service.getTotalCount(3);

      expect(fixture.projectRepository.createQueryBuilder).toHaveBeenCalledWith('project');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.owner', 'owner');
      expect(qb.leftJoin).toHaveBeenCalledWith('project.members', 'member', 'member.userId = :userId', { userId: 3 });
      expect(qb.andWhere).toHaveBeenCalledWith('project.archivedAt IS NULL');
      expect(total).toBe(7);
    });
  });

  describe('findOneById', () => {
    it('delegates to ProjectAccessService', async () => {
      const project = { id: 9 } as Project;
      fixture.projectAccessService.getAccessOrThrow.mockResolvedValueOnce(project);

      const result = await fixture.service.findOneById(1, 9);

      expect(fixture.projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(1, 9);
      expect(result).toBe(project);
    });
  });

  describe('create', () => {
    it('creates a project without logo', async () => {
      const payload = { name: 'New', description: 'Desc' } as CreateProjectDto;
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 1, ...entity }));

      const created = await fixture.service.create(2, payload);

      expect(fixture.projectRepository.save).toHaveBeenCalledWith(expect.objectContaining(payload));
      expect(created).toEqual(expect.objectContaining({ id: 1, name: 'New' }));
      expect(fixture.fileStorageService.saveFile).not.toHaveBeenCalled();
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.created',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 1,
        details: { projectId: 1, 'after.name': 'New', 'after.hasLogo': 0 },
      });
    });

    it('records a legacy empty project name as omitted instead of dropping the deletion event', async () => {
      fixture.resourceUsageRepository.update.mockResolvedValue({} as never);
      fixture.projectRepository.delete.mockResolvedValueOnce({ affected: 1 } as never);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce({ id: 99, name: '   ', logo: null } as Project);

      await fixture.service.deleteOne(7, 99);

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.deleted',
          details: { projectId: 99, 'before.hasLogo': 0, 'before.nameOmitted': 1 },
        }),
      );
    });

    it('stores the logo when provided', async () => {
      const payload = {
        name: 'New',
        description: 'Desc',
        logo: Buffer.from('x') as unknown as FileUpload,
      } as CreateProjectDto;
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 4, ...entity }));
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('logo.png');
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => entity);

      const created = await fixture.service.create(2, payload);

      expect(fixture.fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/4');
      expect(created.logo).toBe('logo.png');
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ action: 'project.created' }),
      );
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          action: 'project.updated',
          details: expect.objectContaining({ changedFields: '["logo"]' }),
        }),
      );
    });

    it('records creation before a later logo write fails', async () => {
      const payload = {
        name: 'New',
        description: 'Desc',
        logo: Buffer.from('x') as unknown as FileUpload,
      } as CreateProjectDto;
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 4, ...entity }));
      fixture.fileStorageService.saveFile.mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(fixture.service.create(2, payload)).rejects.toThrow('storage unavailable');

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.created',
          subjectId: 4,
          details: { projectId: 4, 'after.name': 'New', 'after.hasLogo': 0 },
        }),
      );
    });
  });

  describe('deleteOne', () => {
    it('unlinks resource usage entries before deleting the project', async () => {
      fixture.resourceUsageRepository.update.mockResolvedValue({} as never);
      fixture.projectRepository.delete.mockResolvedValueOnce({ affected: 1 } as never);

      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce({
        id: 99,
        name: 'Deleted',
        logo: null,
      } as Project);
      await fixture.service.deleteOne(7, 99);

      expect(fixture.resourceUsageRepository.update).toHaveBeenCalledWith({ projectId: 99 }, { projectId: null });
      expect(fixture.projectRepository.delete).toHaveBeenCalledWith(99);
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.deleted',
        actorId: 7,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 99,
        details: { projectId: 99, 'before.name': 'Deleted', 'before.hasLogo': 0 },
      });
    });

    it('rolls back usage detachment when the project delete affects no row', async () => {
      fixture.resourceUsageRepository.update.mockResolvedValue({} as never);
      fixture.projectRepository.delete.mockResolvedValueOnce({ affected: 0 } as never);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce({
        id: 99,
        name: 'Deleted',
        logo: null,
      } as Project);

      await expect(fixture.service.deleteOne(7, 99)).rejects.toBeInstanceOf(NotFoundException);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.projectsTotal.dec).not.toHaveBeenCalled();
    });

    // Schema synchronization under CI coverage can exceed Jest's five-second default.
    it('rolls back SQLite usage detachment on a delete abort and records only the successful delete', async () => {
      const source = await new DataSource({
        type: 'sqlite',
        database: ':memory:',
        entities: Object.values(entities),
        synchronize: true,
      }).initialize();
      try {
        await source.query('PRAGMA foreign_keys = OFF');
        await source.query("INSERT INTO user (username, email) VALUES ('owner', 'owner@example.test')");
        await source.query("INSERT INTO project (userId, name) VALUES (1, 'Project')");
        await source.query(
          "INSERT INTO resource_usage (usageAction, resourceId, startTime, projectId) VALUES ('usage', 1, CURRENT_TIMESTAMP, 1)",
        );
        const projects = source.getRepository(Project);
        const sqliteAudit = { recordProject: jest.fn().mockResolvedValue(undefined) };
        const sqliteMetrics = { projectsTotal: { inc: jest.fn(), dec: jest.fn() } };
        const sqliteService = new ProjectsService(
          projects,
          source.getRepository(ProjectMember),
          source.getRepository(ProjectInvitation),
          source.getRepository(User),
          source.getRepository(ResourceUsage),
          {} as FileStorageService,
          {
            ensureOwner: jest.fn().mockResolvedValue({ id: 1, name: 'Project', logo: null }),
          } as unknown as ProjectAccessService,
          {} as EmailService,
          sqliteMetrics as MetricsService,
          {} as NotificationDispatchService,
          sqliteAudit as unknown as AuditService,
        );
        await source.query(
          "CREATE TRIGGER abort_project_delete BEFORE DELETE ON project BEGIN SELECT RAISE(ABORT, 'delete aborted'); END",
        );

        await expect(sqliteService.deleteOne(1, 1)).rejects.toThrow('delete aborted');
        expect((await source.query('SELECT projectId FROM resource_usage WHERE id = 1'))[0].projectId).toBe(1);
        expect(sqliteAudit.recordProject).not.toHaveBeenCalled();
        expect(sqliteMetrics.projectsTotal.dec).not.toHaveBeenCalled();

        await source.query('DROP TRIGGER abort_project_delete');
        await sqliteService.deleteOne(1, 1);
        expect((await source.query('SELECT projectId FROM resource_usage WHERE id = 1'))[0].projectId).toBeNull();
        expect(sqliteAudit.recordProject).toHaveBeenCalledTimes(1);
        expect(sqliteMetrics.projectsTotal.dec).toHaveBeenCalledTimes(1);
        await expect(sqliteService.deleteOne(1, 1)).rejects.toBeInstanceOf(NotFoundException);
        expect(sqliteAudit.recordProject).toHaveBeenCalledTimes(1);
      } finally {
        await source.destroy();
      }
    }, 30_000);
  });

  describe('updateOne', () => {
    it('throws when the project is missing', async () => {
      fixture.projectAccessService.ensureOwner.mockRejectedValueOnce(new NotFoundException());
      await expect(fixture.service.updateOne(1, 1, {} as UpdateProjectDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates fields when project exists', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const updated = await fixture.service.updateOne(1, 3, { name: 'New' } as UpdateProjectDto);

      expect(fixture.projectRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, name: 'New' }));
      expect(updated.name).toBe('New');
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.updated',
        actorId: 1,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: {
          projectId: 3,
          'before.name': 'Old',
          'before.hasLogo': 0,
          'after.name': 'New',
          'after.hasLogo': 0,
          changedFields: '["name"]',
        },
      });
    });

    it('replaces logos when requested', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: 'old.png' } as Project;
      const payload = { logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      const result = await fixture.service.updateOne(1, 3, payload);

      expect(fixture.fileStorageService.deleteFile).toHaveBeenCalledWith('projects/3', 'old.png');
      expect(fixture.fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/3');
      expect(result.logo).toBe('new.png');
      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.updated',
        actorId: 1,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: {
          projectId: 3,
          'before.name': 'Old',
          'before.hasLogo': 1,
          'after.name': 'Old',
          'after.hasLogo': 1,
          changedFields: '["logo"]',
        },
      });
    });

    it('records an update when its only project save succeeds', async () => {
      const existing = { id: 3, name: 'Old', description: 'Old', logo: 'old.png' } as Project;
      const payload = { name: 'New', logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      await fixture.service.updateOne(1, 3, payload);

      expect(fixture.projectRepository.save).toHaveBeenCalledTimes(1);
      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.updated',
          details: expect.objectContaining({ changedFields: '["name","logo"]' }),
        }),
      );
    });

    it('does not record an update when safe state values are unchanged', async () => {
      const existing = { id: 3, name: 'Same', description: 'Same', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      await fixture.service.updateOne(1, 3, { name: 'Same', description: 'Same' } as UpdateProjectDto);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });

    it('does not record an unchanged legacy long-name update', async () => {
      const longName = '😀'.repeat(100);
      const existing = { id: 3, name: longName, description: 'Same', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(existing);
      fixture.projectRepository.save.mockImplementation(async (entity: Project) => entity);

      await fixture.service.updateOne(1, 3, { name: longName } as UpdateProjectDto);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });

    it('records archive lifecycle changes with the initiating actor', async () => {
      const project = { id: 3, name: 'Project', logo: null } as Project;
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project);
      fixture.projectRepository.update.mockResolvedValue({ affected: 1 } as never);

      await fixture.service.archiveOne(2, 3);
      await fixture.service.unarchiveOne(2, 3);

      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(1, {
        action: 'project.archived',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: { projectId: 3, 'after.name': 'Project', 'after.hasLogo': 0, 'after.archived': 1 },
      });
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(2, {
        action: 'project.unarchived',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project',
        subjectId: 3,
        details: { projectId: 3, 'after.name': 'Project', 'after.hasLogo': 0, 'after.archived': 0 },
      });
    });

    it('returns the refetched lifecycle state without recording a duplicate event', async () => {
      const archivedProject = { id: 3, name: 'Archived', archivedAt: new Date(), logo: null } as Project;
      const activeProject = { id: 4, name: 'Active', archivedAt: null, logo: null } as Project;
      const concurrentlyArchived = { id: 3, name: 'Archived', archivedAt: new Date(), logo: null } as Project;
      const concurrentlyUnarchived = { id: 4, name: 'Active', archivedAt: null, logo: null } as Project;
      fixture.projectAccessService.ensureOwner
        .mockResolvedValueOnce(archivedProject)
        .mockResolvedValueOnce(activeProject);
      fixture.projectRepository.update.mockResolvedValue({ affected: 0 } as never);
      fixture.projectRepository.findOneByOrFail
        .mockResolvedValueOnce(concurrentlyArchived)
        .mockResolvedValueOnce(concurrentlyUnarchived);

      expect(await fixture.service.archiveOne(2, 3)).toBe(concurrentlyArchived);
      expect(await fixture.service.unarchiveOne(2, 4)).toBe(concurrentlyUnarchived);

      expect(fixture.projectRepository.save).not.toHaveBeenCalled();
      expect(fixture.projectRepository.update).toHaveBeenCalledTimes(2);
      expect(fixture.projectRepository.findOneByOrFail).toHaveBeenNthCalledWith(1, { id: 3 });
      expect(fixture.projectRepository.findOneByOrFail).toHaveBeenNthCalledWith(2, { id: 4 });
      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });
  });

  describe('membership and invitation audit events', () => {
    it('records invitations sent and revoked by the project owner', async () => {
      const project = { id: 3, name: 'Project', owner: { id: 2 } } as Project;
      const invitation = {
        id: 7,
        projectId: 3,
        inviterId: 2,
        invitedUserId: 9,
        requestedRole: 'viewer',
        status: 'pending',
      } as ProjectInvitation;
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project);
      fixture.userRepository.findOne.mockResolvedValue({ id: 9 } as User);
      fixture.projectMemberRepository.findOne.mockResolvedValue(null);
      fixture.projectInvitationRepository.findOne.mockResolvedValueOnce(null).mockResolvedValue(invitation);
      fixture.projectInvitationRepository.save.mockResolvedValue(invitation);

      await fixture.service.createProjectInvitation(2, 3, 9);
      await fixture.service.cancelProjectInvitation(2, 3, 7);

      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(1, {
        action: 'project.invitation.sent',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project.invitation',
        subjectId: 7,
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(2, {
        action: 'project.invitation.revoked',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project.invitation',
        subjectId: 7,
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
    });

    it('uses request foreign keys when auditing a newly created invitation', async () => {
      const project = { id: 3, name: 'Project', owner: { id: 2 } } as Project;
      const savedInvitation = { id: 7 } as ProjectInvitation;
      const invitation = {
        id: 7,
        projectId: 3,
        inviterId: 2,
        invitedUserId: 9,
        requestedRole: 'viewer',
        status: 'pending',
      } as ProjectInvitation;
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project);
      fixture.userRepository.findOne.mockResolvedValue({ id: 9 } as User);
      fixture.projectMemberRepository.findOne.mockResolvedValue(null);
      fixture.projectInvitationRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(invitation);
      fixture.projectInvitationRepository.save.mockResolvedValue(savedInvitation);

      await fixture.service.createProjectInvitation(2, 3, 9);

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.invitation.sent',
          subjectId: 7,
          details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
        }),
      );
    });

    it('records the owner and affected membership after removal', async () => {
      fixture.projectMemberRepository.findOne.mockResolvedValueOnce({
        id: 8,
        userId: 9,
        role: 'viewer',
      } as ProjectMember);
      fixture.projectMemberRepository.delete.mockResolvedValueOnce({ affected: 1 } as never);

      await fixture.service.removeMember(2, 3, 8);

      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.member.removed',
        actorId: 2,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project.member',
        subjectId: 8,
        details: { projectId: 3, memberId: 8, userId: 9, role: 'viewer' },
      });
    });

    it('does not audit a membership removal that did not affect a row', async () => {
      fixture.projectMemberRepository.findOne.mockResolvedValueOnce({
        id: 8,
        userId: 9,
        role: 'viewer',
      } as ProjectMember);
      fixture.projectMemberRepository.delete.mockResolvedValueOnce({ affected: 0 } as never);

      await fixture.service.removeMember(2, 3, 8);

      expect(fixture.audit.recordProject).not.toHaveBeenCalled();
    });

    it('records accepted invitations and the membership role using the accepting user as actor', async () => {
      const invitation = {
        id: 7,
        projectId: 3,
        invitedUserId: 9,
        requestedRole: 'viewer',
        status: 'pending',
      } as ProjectInvitation;
      fixture.projectInvitationRepository.findOne.mockResolvedValue(invitation);
      fixture.projectInvitationRepository.save.mockResolvedValue(invitation);
      fixture.projectMemberRepository.findOne.mockResolvedValue(null);
      fixture.projectMemberRepository.save.mockResolvedValue({
        id: 8,
        projectId: 3,
        userId: 9,
        role: 'viewer',
      } as ProjectMember);

      await fixture.service.acceptInvitation(9, 7);

      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(1, {
        action: 'project.invitation.accepted',
        actorId: 9,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project.invitation',
        subjectId: 7,
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
      expect(fixture.audit.recordProject).toHaveBeenNthCalledWith(2, {
        action: 'project.member.added',
        actorId: 9,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project.member',
        subjectId: 8,
        details: { projectId: 3, memberId: 8, userId: 9, role: 'viewer' },
      });
    });

    it('records rejected invitations using the invited user as actor', async () => {
      const invitation = {
        id: 7,
        projectId: 3,
        invitedUserId: 9,
        requestedRole: 'viewer',
        status: 'pending',
      } as ProjectInvitation;
      fixture.projectInvitationRepository.findOne.mockResolvedValue(invitation);
      fixture.projectInvitationRepository.save.mockResolvedValue(invitation);

      await fixture.service.declineInvitation(9, 7);

      expect(fixture.audit.recordProject).toHaveBeenCalledWith({
        action: 'project.invitation.rejected',
        actorId: 9,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'project.invitation',
        subjectId: 7,
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
    });

    it('records acceptance before a later membership write fails', async () => {
      const invitation = {
        id: 7,
        projectId: 3,
        invitedUserId: 9,
        requestedRole: 'viewer',
        status: 'pending',
      } as ProjectInvitation;
      fixture.projectInvitationRepository.findOne.mockResolvedValue(invitation);
      fixture.projectInvitationRepository.save.mockResolvedValue(invitation);
      fixture.projectMemberRepository.findOne.mockResolvedValue(null);
      fixture.projectMemberRepository.save.mockRejectedValueOnce(new Error('membership unavailable'));

      await expect(fixture.service.acceptInvitation(9, 7)).rejects.toThrow('membership unavailable');

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.invitation.accepted',
          subjectId: 7,
        }),
      );
    });

    it('projects legacy empty and long UTF-8 names without suppressing audit events', async () => {
      const longName = '😀'.repeat(100);
      fixture.projectRepository.save.mockImplementationOnce(async (entity: Project) => ({ id: 1, ...entity }));

      await fixture.service.create(2, { name: longName, description: 'Desc' } as CreateProjectDto);

      expect(fixture.audit.recordProject).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ 'after.nameTruncated': 1, 'after.hasLogo': 0 }),
        }),
      );
    });
  });
});
