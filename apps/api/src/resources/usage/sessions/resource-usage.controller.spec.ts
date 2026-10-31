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
  expect(getSessionDetails).toHaveBeenCalledWith(5, 8, request.user, true, undefined);
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

describe('active sessions of a machine with parallel sessions', () => {
  const mine = { id: 1, resourceId: 5, userId: 1, user: { username: 'me' } };
  const theirs = { id: 2, resourceId: 5, userId: 2, user: { username: 'other' } };
  const build = async (access: 'full' | 'anonymous' | 'none', usages = [mine, theirs]) => {
    const overview = {
      usage: usages.find((usage) => usage.userId === 1) ?? usages[usages.length - 1] ?? null,
      usages,
      activeSessionCount: usages.length,
      maxParallelSessions: 3,
      isFull: false,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ResourceUsageController],
      providers: [
        {
          provide: ResourceUsageService,
          useValue: { getActiveSessionOverview: jest.fn().mockResolvedValue(overview) },
        },
        {
          provide: ResourceActivityVisibilityService,
          useValue: Object.assign(new ResourceActivityVisibilityService({} as never, {} as never, {} as never), {
            resolve: jest.fn().mockResolvedValue(access),
          }),
        },
      ],
    }).compile();
    return moduleRef.get(ResourceUsageController);
  };
  const request = { user: { id: 1 } } as AuthenticatedRequest;

  it('returns all sessions with count and limit, and the caller own session as usage', async () => {
    const result = await (await build('full')).getActiveSession(5, request);
    expect(result).toMatchObject({ usage: { id: 1 }, activeSessionCount: 2, maxParallelSessions: 3, isFull: false });
    expect(result.usages.map((usage) => usage.id)).toEqual([1, 2]);
  });

  it('redacts other people sessions for anonymous viewers but keeps the own one', async () => {
    const result = await (await build('anonymous')).getActiveSession(5, request);
    expect(result.usages[0]).toMatchObject({ id: 1, user: { username: 'me' } });
    expect(result.usages[1]).not.toHaveProperty('user');
  });

  it('shows a viewer without activity access only their own session and refuses otherwise', async () => {
    const own = await (await build('none')).getActiveSession(5, request);
    expect(own.usages.map((usage) => usage.id)).toEqual([1]);
    await expect((await build('none', [theirs])).getActiveSession(5, request)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
