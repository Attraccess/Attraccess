import { Project, ProjectInvitation, ProjectMember, User } from '@attraccess/database-entities';
import { CreateProjectDto } from './dto/create.dto';
import { registerProjectsServiceFixture } from './projects.service.projects-service.test-fixture';
export function registerMembershipAndInvitationAuditEventsCases(
  fixture: ReturnType<typeof registerProjectsServiceFixture>,
) {
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
}
