import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceUsageController } from './resource-usage.controller';
import { ResourceUsageService } from './resource-usage.service';
import { ResourceActivityVisibilityService } from '../authorization/resource-activity-visibility.service';

it('passes the authenticated user and both IDs to the usage details lookup', async () => {
  const getSessionDetails = jest.fn().mockResolvedValue({ id: 8 });
  const moduleRef = await Test.createTestingModule({
    controllers: [ResourceUsageController],
    providers: [
      { provide: ResourceUsageService, useValue: { getSessionDetails } },
      {
        provide: ResourceActivityVisibilityService,
        useValue: Object.assign(new ResourceActivityVisibilityService({} as never, {} as never, {} as never), {
          resolveSessions: jest.fn().mockResolvedValue('full'),
        }),
      },
    ],
  }).compile();
  const request = { user: { id: 1, effectivePermissions: new Set(['resources.update']) } } as AuthenticatedRequest;
  expect(await moduleRef.get(ResourceUsageController).getSession(5, 8, request)).toEqual({ id: 8 });
  expect(getSessionDetails).toHaveBeenCalledWith(5, 8, request.user, true);
});

describe('usage history visibility', () => {
  const sessions = [
    { id: 1, resourceId: 5, userId: 1, startNotes: 'mine' },
    { id: 2, resourceId: 5, userId: 2, startNotes: 'theirs', user: { username: 'other' } },
  ];
  const build = async (access: 'full' | 'anonymous' | 'none') => {
    const getResourceUsageHistory = jest.fn().mockResolvedValue({ data: sessions, total: 2 });
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        { provide: ResourceUsageService, useValue: { getResourceUsageHistory } },
        {
          provide: ResourceActivityVisibilityService,
          useValue: new ResourceActivityVisibilityService({} as never, {} as never, {} as never),
        },
      ],
    }).compile();
    moduleRef.get(ResourceActivityVisibilityService).resolveSessions = jest.fn().mockResolvedValue(access);
    return { controller: moduleRef.get(ResourceUsageController), getResourceUsageHistory };
  };
  const request = {
    user: { id: 1, effectivePermissions: new Set(['resources.access.manage']) },
  } as AuthenticatedRequest;

  it('gives full access every session, optionally filtered by user', async () => {
    const { controller, getResourceUsageHistory } = await build('full');
    const result = await controller.getHistory(5, { page: 1, limit: 10, userId: 2 }, request);
    expect(result.data).toEqual(sessions);
    expect(getResourceUsageHistory).toHaveBeenCalledWith(5, 1, 10, 2);
  });

  it("redacts other people's sessions for anonymous access and refuses a user filter", async () => {
    const { controller } = await build('anonymous');
    const result = await controller.getHistory(5, { page: 1, limit: 10 }, request);
    expect(result.data[0]).toEqual(sessions[0]);
    expect(result.data[1]).not.toHaveProperty('user');
    expect(result.data[1]).not.toHaveProperty('startNotes');
    await expect(controller.getHistory(5, { page: 1, limit: 10, userId: 2 }, request)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("limits hidden activity to the viewer's own sessions", async () => {
    const { controller, getResourceUsageHistory } = await build('none');
    await controller.getHistory(5, { page: 1, limit: 10 }, request);
    expect(getResourceUsageHistory).toHaveBeenCalledWith(5, 1, 10, 1);
    await expect(controller.getHistory(5, { page: 1, limit: 10, userId: 2 }, request)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
