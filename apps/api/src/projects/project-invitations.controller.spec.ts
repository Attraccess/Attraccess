import { Test, TestingModule } from '@nestjs/testing';
import { ProjectInvitationsController } from './project-invitations.controller';
import { ProjectsService } from './projects.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { ProjectInvitationRecord, UserContact } from '@attraccess/application-models';

const contact = (id: number): UserContact => ({
  id,
  username: `user${id}`,
  email: `user${id}@example.test`,
  locale: 'en',
  dateTimeLocale: null,
  isEmailVerified: true,
  isDisabled: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  externalIdentifier: null,
  creditBalance: 0,
  billingFactor: 100,
});

const record = (id: number): ProjectInvitationRecord => ({
  id,
  projectId: 1,
  inviterId: 1,
  invitedUserId: 2,
  status: 'pending' as ProjectInvitationRecord['status'],
  requestedRole: 'viewer' as ProjectInvitationRecord['requestedRole'],
  respondedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  inviter: contact(1),
  invitedUser: contact(2),
});

describe('ProjectInvitationsController', () => {
  let controller: ProjectInvitationsController;
  const projectsService = {
    listPendingInvitationsForUser: jest.fn(),
    acceptInvitation: jest.fn(),
    declineInvitation: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectInvitationsController],
      providers: [{ provide: ProjectsService, useValue: projectsService }],
    }).compile();

    controller = module.get(ProjectInvitationsController);
  });

  it('lists invitations for the authenticated user', async () => {
    const req = { user: { id: 1 } } as AuthenticatedRequest;
    const invitations = [record(1)];
    projectsService.listPendingInvitationsForUser.mockResolvedValueOnce(invitations);

    const result = await controller.listMyInvitations(req);

    expect(projectsService.listPendingInvitationsForUser).toHaveBeenCalledWith(1);
    expect(result.map(({ id }) => id)).toEqual([1]);
  });

  it('never returns the email address or private user fields of the people involved', async () => {
    const req = { user: { id: 1 } } as AuthenticatedRequest;
    projectsService.listPendingInvitationsForUser.mockResolvedValueOnce([record(1)]);

    const body = JSON.stringify(await controller.listMyInvitations(req));

    expect(body).not.toContain('@example.test');
    expect(body).not.toContain('email');
    expect(body).not.toContain('Token');
    expect(JSON.parse(body)[0].inviter).toEqual(
      expect.objectContaining({ id: 1, username: 'user1', isDisabled: false, creditBalance: 0 }),
    );
  });

  it('accepts an invitation', async () => {
    const req = { user: { id: 2 } } as AuthenticatedRequest;
    const invitation = record(3);
    projectsService.acceptInvitation.mockResolvedValueOnce(invitation);

    const result = await controller.acceptInvitation(req, 3);

    expect(projectsService.acceptInvitation).toHaveBeenCalledWith(2, 3, 'session', undefined);
    expect(result.id).toBe(invitation.id);
  });

  it('declines an invitation', async () => {
    const req = { user: { id: 4 } } as AuthenticatedRequest;
    const invitation = record(5);
    projectsService.declineInvitation.mockResolvedValueOnce(invitation);

    const result = await controller.declineInvitation(req, 5);

    expect(projectsService.declineInvitation).toHaveBeenCalledWith(4, 5, 'session', undefined);
    expect(result.id).toBe(invitation.id);
  });
});
