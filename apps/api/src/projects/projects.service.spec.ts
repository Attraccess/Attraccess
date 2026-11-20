import { NotFoundException } from '@nestjs/common';
import type { ProjectInvitationRecord, ProjectMemberRecord, ProjectRecord } from '@attraccess/application-models';
import { FileUpload } from './../common/types/file-upload.types';
import { CreateProjectDto } from './dto/create.dto';
import { FindManyProjectsQueryDto } from './dto/find-many-query.dto';
import { UpdateProjectDto } from './dto/update.dto';
import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';

const project = (overrides: Partial<ProjectRecord> & { id: number }): ProjectRecord => ({
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  archivedAt: null,
  name: 'Project',
  description: null,
  logo: null,
  ...overrides,
});

const invitation = (overrides: Partial<ProjectInvitationRecord> = {}): ProjectInvitationRecord =>
  ({
    id: 7,
    projectId: 3,
    inviterId: 2,
    invitedUserId: 9,
    requestedRole: 'viewer',
    status: 'pending',
    respondedAt: null,
    ...overrides,
  }) as ProjectInvitationRecord;

describe('ProjectsService', () => {
  const fixture = registerProjectsServiceFixture();

  describe('findMany', () => {
    it('returns the accessible projects page with access metadata', async () => {
      fixture.projects.listAccessible.mockResolvedValueOnce([project({ id: 1 })]);
      fixture.projectAccessService.addAccessMetadata.mockResolvedValueOnce([{ id: 1, access: { isOwner: true } }]);
      const query = { page: 2, limit: 10 } as FindManyProjectsQueryDto;

      const result = await fixture.service.findMany(5, query);

      expect(fixture.projects.listAccessible).toHaveBeenCalledWith(5, query);
      expect(fixture.projectAccessService.addAccessMetadata).toHaveBeenCalledWith(5, [project({ id: 1 })]);
      expect(result).toEqual([{ id: 1, access: { isOwner: true } }]);
    });
  });

  describe('getTotalCount', () => {
    it('counts accessible projects for the user', async () => {
      fixture.projects.countAccessible.mockResolvedValueOnce(7);

      expect(await fixture.service.getTotalCount(3)).toBe(7);
      expect(fixture.projects.countAccessible).toHaveBeenCalledWith(3, {});
    });

    it('passes the search through', async () => {
      fixture.projects.countAccessible.mockResolvedValueOnce(2);

      expect(await fixture.service.getTotalCount(3, { search: 'Laser' })).toBe(2);
      expect(fixture.projects.countAccessible).toHaveBeenCalledWith(3, { search: 'Laser' });
    });
  });

  describe('findOneById', () => {
    it('delegates to ProjectAccessService', async () => {
      const found = { id: 9 };
      fixture.projectAccessService.getAccessOrThrow.mockResolvedValueOnce(found);

      const result = await fixture.service.findOneById(1, 9);

      expect(fixture.projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(1, 9);
      expect(result).toBe(found);
    });
  });

  describe('create', () => {
    it('creates a project without logo', async () => {
      const payload = { name: 'New', description: 'Desc' } as CreateProjectDto;
      fixture.projects.create.mockResolvedValueOnce(project({ id: 1, name: 'New', description: 'Desc' }));

      const created = await fixture.service.create(2, payload);

      expect(fixture.projects.create).toHaveBeenCalledWith({ ownerId: 2, name: 'New', description: 'Desc' });
      expect(created).toEqual(expect.objectContaining({ id: 1, name: 'New' }));
      expect(fixture.fileStorageService.saveFile).not.toHaveBeenCalled();
      expect(fixture.audit.record).toHaveBeenCalledWith({
        domain: 'project',
        action: 'project.created',
        actor: { id: 2, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project', id: 1 },
        details: { projectId: 1, 'after.name': 'New', 'after.hasLogo': 0 },
      });
    });

    it('stores the logo when provided', async () => {
      const payload = {
        name: 'New',
        description: 'Desc',
        logo: Buffer.from('x') as unknown as FileUpload,
      } as CreateProjectDto;
      fixture.projects.create.mockResolvedValueOnce(project({ id: 4, name: 'New', description: 'Desc' }));
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('logo.png');
      fixture.projects.updateDetails.mockImplementationOnce(async (id: number, details: object) =>
        project({ id, ...details }),
      );

      const created = await fixture.service.create(2, payload);

      expect(fixture.fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/4');
      expect(fixture.projects.updateDetails).toHaveBeenCalledWith(4, {
        name: 'New',
        description: 'Desc',
        logo: 'logo.png',
      });
      expect(created.logo).toBe('logo.png');
      expect(fixture.audit.record).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ domain: 'project', action: 'project.created' }),
      );
      expect(fixture.audit.record).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          domain: 'project',
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
      fixture.projects.create.mockResolvedValueOnce(project({ id: 4, name: 'New', description: 'Desc' }));
      fixture.fileStorageService.saveFile.mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(fixture.service.create(2, payload)).rejects.toThrow('storage unavailable');

      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'project',
          action: 'project.created',
          subject: expect.objectContaining({ id: 4 }),
          details: { projectId: 4, 'after.name': 'New', 'after.hasLogo': 0 },
        }),
      );
    });

    it('projects legacy empty and long UTF-8 names without suppressing audit events', async () => {
      const longName = '😀'.repeat(100);
      fixture.projects.create.mockResolvedValueOnce(project({ id: 1, name: longName, description: 'Desc' }));

      await fixture.service.create(2, { name: longName, description: 'Desc' } as CreateProjectDto);

      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'project',
          details: expect.objectContaining({ 'after.nameTruncated': 1, 'after.hasLogo': 0 }),
        }),
      );
    });
  });

  describe('deleteOne', () => {
    it('records a legacy empty project name as omitted instead of dropping the deletion event', async () => {
      fixture.projects.deleteProject.mockResolvedValueOnce(true);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(project({ id: 99, name: '   ' }));

      await fixture.service.deleteOne(7, 99);

      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'project',
          action: 'project.deleted',
          details: { projectId: 99, 'before.hasLogo': 0, 'before.nameOmitted': 1 },
        }),
        fixture.uow.scopes[0],
      );
    });

    it('deletes the project and records the audit event in the same unit of work', async () => {
      fixture.projects.deleteProject.mockResolvedValueOnce(true);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(project({ id: 99, name: 'Deleted' }));

      await fixture.service.deleteOne(7, 99);

      expect(fixture.uow.scopes).toHaveLength(1);
      expect(fixture.projects.deleteProject).toHaveBeenCalledWith(99, fixture.uow.scopes[0]);
      expect(fixture.audit.record).toHaveBeenCalledWith(
        {
          domain: 'project',
          action: 'project.deleted',
          actor: { id: 7, authenticationMethod: 'session', apiTokenId: undefined },
          subject: { type: 'project', id: 99 },
          details: { projectId: 99, 'before.name': 'Deleted', 'before.hasLogo': 0 },
        },
        fixture.uow.scopes[0],
      );
      expect(fixture.mockMetricsService.projectsTotal.dec).toHaveBeenCalledTimes(1);
    });

    it('fails the unit of work when the project delete affects no row', async () => {
      fixture.projects.deleteProject.mockResolvedValueOnce(false);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(project({ id: 99, name: 'Deleted' }));

      await expect(fixture.service.deleteOne(7, 99)).rejects.toBeInstanceOf(NotFoundException);

      expect(fixture.audit.record).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.projectsTotal.dec).not.toHaveBeenCalled();
    });
  });

  describe('updateOne', () => {
    const save = () =>
      fixture.projects.updateDetails.mockImplementation(async (id: number, details: object) =>
        project({ id, ...details }),
      );

    it('throws when the project is missing', async () => {
      fixture.projectAccessService.ensureOwner.mockRejectedValueOnce(new NotFoundException());
      await expect(fixture.service.updateOne(1, 1, {} as UpdateProjectDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates fields when project exists', async () => {
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(
        project({ id: 3, name: 'Old', description: 'Old' }),
      );
      save();

      const updated = await fixture.service.updateOne(1, 3, { name: 'New' } as UpdateProjectDto);

      expect(fixture.projects.updateDetails).toHaveBeenCalledWith(3, { name: 'New', description: 'Old', logo: null });
      expect(updated.name).toBe('New');
      expect(fixture.audit.record).toHaveBeenCalledWith({
        domain: 'project',
        action: 'project.updated',
        actor: { id: 1, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project', id: 3 },
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
      const payload = { logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(
        project({ id: 3, name: 'Old', description: 'Old', logo: 'old.png' }),
      );
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      save();

      const result = await fixture.service.updateOne(1, 3, payload);

      expect(fixture.fileStorageService.deleteFile).toHaveBeenCalledWith('projects/3', 'old.png');
      expect(fixture.fileStorageService.saveFile).toHaveBeenCalledWith(payload.logo, 'projects/3');
      expect(result.logo).toBe('new.png');
      expect(fixture.audit.record).toHaveBeenCalledWith({
        domain: 'project',
        action: 'project.updated',
        actor: { id: 1, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project', id: 3 },
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
      const payload = { name: 'New', logo: Buffer.from('n') as unknown as FileUpload } as UpdateProjectDto;
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(
        project({ id: 3, name: 'Old', description: 'Old', logo: 'old.png' }),
      );
      fixture.fileStorageService.saveFile.mockResolvedValueOnce('new.png');
      save();

      await fixture.service.updateOne(1, 3, payload);

      expect(fixture.projects.updateDetails).toHaveBeenCalledTimes(1);
      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'project',
          action: 'project.updated',
          details: expect.objectContaining({ changedFields: '["name","logo"]' }),
        }),
      );
    });

    it('does not record an update when safe state values are unchanged', async () => {
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(
        project({ id: 3, name: 'Same', description: 'Same' }),
      );
      save();

      await fixture.service.updateOne(1, 3, { name: 'Same', description: 'Same' } as UpdateProjectDto);

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('does not record an unchanged legacy long-name update', async () => {
      const longName = '😀'.repeat(100);
      fixture.projectAccessService.ensureOwner.mockResolvedValueOnce(
        project({ id: 3, name: longName, description: 'Same' }),
      );
      save();

      await fixture.service.updateOne(1, 3, { name: longName } as UpdateProjectDto);

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('records archive lifecycle changes with the initiating actor', async () => {
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project({ id: 3, name: 'Project' }));
      fixture.projects.archive.mockResolvedValue(true);
      fixture.projects.unarchive.mockResolvedValue(true);

      await fixture.service.archiveOne(2, 3);
      await fixture.service.unarchiveOne(2, 3);

      expect(fixture.audit.record).toHaveBeenNthCalledWith(1, {
        domain: 'project',
        action: 'project.archived',
        actor: { id: 2, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project', id: 3 },
        details: { projectId: 3, 'after.name': 'Project', 'after.hasLogo': 0, 'after.archived': 1 },
      });
      expect(fixture.audit.record).toHaveBeenNthCalledWith(2, {
        domain: 'project',
        action: 'project.unarchived',
        actor: { id: 2, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project', id: 3 },
        details: { projectId: 3, 'after.name': 'Project', 'after.hasLogo': 0, 'after.archived': 0 },
      });
    });

    it('returns the refetched lifecycle state without recording a duplicate event', async () => {
      const concurrentlyArchived = project({ id: 3, name: 'Archived', archivedAt: new Date() });
      const concurrentlyUnarchived = project({ id: 4, name: 'Active' });
      fixture.projectAccessService.ensureOwner
        .mockResolvedValueOnce(project({ id: 3, name: 'Archived', archivedAt: new Date() }))
        .mockResolvedValueOnce(project({ id: 4, name: 'Active' }));
      fixture.projects.archive.mockResolvedValue(false);
      fixture.projects.unarchive.mockResolvedValue(false);
      fixture.projects.getById
        .mockResolvedValueOnce(concurrentlyArchived)
        .mockResolvedValueOnce(concurrentlyUnarchived);

      expect(await fixture.service.archiveOne(2, 3)).toBe(concurrentlyArchived);
      expect(await fixture.service.unarchiveOne(2, 4)).toBe(concurrentlyUnarchived);

      expect(fixture.projects.updateDetails).not.toHaveBeenCalled();
      expect(fixture.projects.getById).toHaveBeenNthCalledWith(1, 3);
      expect(fixture.projects.getById).toHaveBeenNthCalledWith(2, 4);
      expect(fixture.audit.record).not.toHaveBeenCalled();
    });
  });

  describe('membership and invitation audit events', () => {
    it('records invitations sent and revoked by the project owner', async () => {
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project({ id: 3, owner: { id: 2 } as never }));
      fixture.invitationStore.findInvitee.mockResolvedValue({ id: 9 });
      fixture.projects.findMembership.mockResolvedValue(null);
      fixture.invitationStore.findPending.mockResolvedValue(null);
      fixture.invitationStore.create.mockResolvedValue(invitation());
      fixture.invitationStore.findById.mockResolvedValue(invitation());

      await fixture.service.createProjectInvitation(2, 3, 9);
      await fixture.service.cancelProjectInvitation(2, 3, 7);

      expect(fixture.audit.record).toHaveBeenNthCalledWith(1, {
        domain: 'project',
        action: 'project.invitation.sent',
        actor: { id: 2, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project.invitation', id: 7 },
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
      expect(fixture.audit.record).toHaveBeenNthCalledWith(2, {
        domain: 'project',
        action: 'project.invitation.revoked',
        actor: { id: 2, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project.invitation', id: 7 },
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
    });

    it('creates the invitation for the request foreign keys', async () => {
      fixture.projectAccessService.ensureOwner.mockResolvedValue(project({ id: 3, owner: { id: 2 } as never }));
      fixture.invitationStore.findInvitee.mockResolvedValue({ id: 9 });
      fixture.projects.findMembership.mockResolvedValue(null);
      fixture.invitationStore.findPending.mockResolvedValue(null);
      fixture.invitationStore.create.mockResolvedValue(invitation());
      fixture.invitationStore.findById.mockResolvedValue(invitation());

      await fixture.service.createProjectInvitation(2, 3, 9);

      expect(fixture.invitationStore.create).toHaveBeenCalledWith({
        projectId: 3,
        inviterId: 2,
        invitedUserId: 9,
        requestedRole: 'viewer',
      });
      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'project',
          action: 'project.invitation.sent',
          subject: expect.objectContaining({ id: 7 }),
          details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
        }),
      );
    });

    it('records the owner and affected membership after removal', async () => {
      fixture.projects.findMember.mockResolvedValueOnce({ id: 8, userId: 9, role: 'viewer' } as ProjectMemberRecord);
      fixture.projects.removeMember.mockResolvedValueOnce(true);

      await fixture.service.removeMember(2, 3, 8);

      expect(fixture.audit.record).toHaveBeenCalledWith({
        domain: 'project',
        action: 'project.member.removed',
        actor: { id: 2, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project.member', id: 8 },
        details: { projectId: 3, memberId: 8, userId: 9, role: 'viewer' },
      });
    });

    it('does not audit a membership removal that did not affect a row', async () => {
      fixture.projects.findMember.mockResolvedValueOnce({ id: 8, userId: 9, role: 'viewer' } as ProjectMemberRecord);
      fixture.projects.removeMember.mockResolvedValueOnce(false);

      await fixture.service.removeMember(2, 3, 8);

      expect(fixture.audit.record).not.toHaveBeenCalled();
    });

    it('records accepted invitations and the membership role using the accepting user as actor', async () => {
      fixture.invitationStore.findById.mockResolvedValue(invitation());
      fixture.invitationStore.addMemberIfMissing.mockResolvedValue({
        id: 8,
        projectId: 3,
        userId: 9,
        role: 'viewer',
      });

      await fixture.service.acceptInvitation(9, 7);

      expect(fixture.invitationStore.recordResponse).toHaveBeenCalledWith(7, 'accepted', expect.any(Date));
      expect(fixture.invitationStore.addMemberIfMissing).toHaveBeenCalledWith(3, 9, 'viewer');
      expect(fixture.audit.record).toHaveBeenNthCalledWith(1, {
        domain: 'project',
        action: 'project.invitation.accepted',
        actor: { id: 9, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project.invitation', id: 7 },
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
      expect(fixture.audit.record).toHaveBeenNthCalledWith(2, {
        domain: 'project',
        action: 'project.member.added',
        actor: { id: 9, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project.member', id: 8 },
        details: { projectId: 3, memberId: 8, userId: 9, role: 'viewer' },
      });
    });

    it('records rejected invitations using the invited user as actor', async () => {
      fixture.invitationStore.findById.mockResolvedValue(invitation());

      await fixture.service.declineInvitation(9, 7);

      expect(fixture.invitationStore.recordResponse).toHaveBeenCalledWith(7, 'declined', expect.any(Date));
      expect(fixture.audit.record).toHaveBeenCalledWith({
        domain: 'project',
        action: 'project.invitation.rejected',
        actor: { id: 9, authenticationMethod: 'session', apiTokenId: undefined },
        subject: { type: 'project.invitation', id: 7 },
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      });
    });

    it('records acceptance before a later membership write fails', async () => {
      fixture.invitationStore.findById.mockResolvedValue(invitation());
      fixture.invitationStore.addMemberIfMissing.mockRejectedValueOnce(new Error('membership unavailable'));

      await expect(fixture.service.acceptInvitation(9, 7)).rejects.toThrow('membership unavailable');

      expect(fixture.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'project',
          action: 'project.invitation.accepted',
          subject: expect.objectContaining({ id: 7 }),
        }),
      );
    });

    it('rejects a response from a user the invitation was not sent to', async () => {
      fixture.invitationStore.findById.mockResolvedValue(invitation({ invitedUserId: 1 }));

      await expect(fixture.service.acceptInvitation(9, 7)).rejects.toBeInstanceOf(NotFoundException);
      expect(fixture.invitationStore.recordResponse).not.toHaveBeenCalled();
    });
  });
});
