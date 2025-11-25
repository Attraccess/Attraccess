import { Test, TestingModule } from '@nestjs/testing';
import { ProjectInvitationsController } from './project-invitations.controller';
import { ProjectsService } from './projects.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ProjectInvitation } from '@attraccess/database-entities';

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
    const invitations = [{ id: 1 }] as ProjectInvitation[];
    projectsService.listPendingInvitationsForUser.mockResolvedValueOnce(invitations);

    const result = await controller.listMyInvitations(req);

    expect(projectsService.listPendingInvitationsForUser).toHaveBeenCalledWith(1);
    expect(result).toBe(invitations);
  });

  it('accepts an invitation', async () => {
    const req = { user: { id: 2 } } as AuthenticatedRequest;
    const invitation = { id: 3 } as ProjectInvitation;
    projectsService.acceptInvitation.mockResolvedValueOnce(invitation);

    const result = await controller.acceptInvitation(req, 3);

    expect(projectsService.acceptInvitation).toHaveBeenCalledWith(2, 3);
    expect(result).toBe(invitation);
  });

  it('declines an invitation', async () => {
    const req = { user: { id: 4 } } as AuthenticatedRequest;
    const invitation = { id: 5 } as ProjectInvitation;
    projectsService.declineInvitation.mockResolvedValueOnce(invitation);

    const result = await controller.declineInvitation(req, 5);

    expect(projectsService.declineInvitation).toHaveBeenCalledWith(4, 5);
    expect(result).toBe(invitation);
  });
});
