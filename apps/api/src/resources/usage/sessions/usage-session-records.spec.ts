import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSession } from '@attraccess/application-models';
import { UsageSessionStore } from '../usage-session-store.port';
import { UsageSessionRecords } from './usage-session-records';

/** The records read through the usage session port only: no ORM, no database. */
describe('UsageSessionRecords', () => {
  const session = (overrides: Partial<UsageSession> = {}): UsageSession =>
    ({
      id: 1,
      resourceId: 5,
      userId: 7,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-08-28T10:00:00.000Z'),
      endTime: null,
      projectId: null,
      ...overrides,
    }) as UsageSession;

  let store: jest.Mocked<
    Pick<
      UsageSessionStore,
      | 'findActiveSessions'
      | 'findActiveSessionsByResource'
      | 'findMachineCapacity'
      | 'findPublishedSession'
      | 'findHistory'
      | 'findSessionForProjectChange'
      | 'assignProject'
    >
  >;
  let projects: { findOneById: jest.Mock };
  let records: UsageSessionRecords;

  beforeEach(() => {
    store = {
      findActiveSessions: jest.fn().mockResolvedValue([]),
      findActiveSessionsByResource: jest.fn(),
      findMachineCapacity: jest.fn().mockResolvedValue({ type: ResourceType.Machine, maxParallelSessions: 3 }),
      findPublishedSession: jest.fn(),
      findHistory: jest.fn(),
      findSessionForProjectChange: jest.fn(),
      assignProject: jest.fn(async (usage) => usage),
    };
    projects = { findOneById: jest.fn() };
    records = new UsageSessionRecords(store as unknown as UsageSessionStore, projects as never);
  });

  describe('active sessions', () => {
    it('prefers the callers own session and otherwise the newest', async () => {
      const sessions = [session({ id: 1, userId: 1 }), session({ id: 2, userId: 2 }), session({ id: 3, userId: 3 })];
      store.findActiveSessions.mockResolvedValue(sessions);

      expect((await records.getActiveSession(5, undefined, 1))?.id).toBe(1);
      expect((await records.getActiveSession(5, undefined, 99))?.id).toBe(3);
      expect((await records.getActiveSession(5))?.id).toBe(3);
    });

    it('hands the caller transaction to the store, so a read sees what the transaction wrote', async () => {
      const transaction = {};

      await records.getActiveSessionsForResource(5, transaction);

      expect(store.findActiveSessions).toHaveBeenCalledWith(5, transaction);
    });

    it('answers no session for a free machine', async () => {
      await expect(records.getActiveSession(5)).resolves.toBeNull();
    });

    it('reports the slots of a shared machine, with the callers own session first', async () => {
      store.findActiveSessions.mockResolvedValue([session({ id: 1, userId: 1 }), session({ id: 2, userId: 2 })]);

      const overview = await records.getActiveSessionOverview(5, 1);

      expect(overview).toMatchObject({
        usage: { id: 1 },
        activeSessionCount: 2,
        maxParallelSessions: 3,
        isFull: false,
      });
    });

    it('treats a resource it cannot find like a single-session machine', async () => {
      store.findMachineCapacity.mockResolvedValue(null);
      store.findActiveSessions.mockResolvedValue([session({ id: 4, userId: 9 })]);

      expect(await records.getActiveSessionOverview(5, 1)).toMatchObject({ maxParallelSessions: 1, isFull: true });
    });
  });

  describe('session details', () => {
    const viewer = { id: 7 } as never;

    it('shows a session to its owner and to anyone who may see all of them', async () => {
      store.findPublishedSession.mockResolvedValue(session({ userId: 7 }));
      await expect(records.getSessionDetails(5, 1, viewer)).resolves.toMatchObject({ id: 1 });

      store.findPublishedSession.mockResolvedValue(session({ userId: 8 }));
      await expect(records.getSessionDetails(5, 1, viewer, true)).resolves.toMatchObject({ id: 1 });
    });

    it('answers 404 for a session that does not exist or that the viewer may not see', async () => {
      store.findPublishedSession.mockResolvedValueOnce(null);
      await expect(records.getSessionDetails(5, 1, viewer)).rejects.toThrow(NotFoundException);

      store.findPublishedSession.mockResolvedValueOnce(session({ userId: 8 }));
      await expect(records.getSessionDetails(5, 1, viewer)).rejects.toThrow(NotFoundException);
    });

    it('lets members of the sessions project see it, and gives everyone else the redacted view', async () => {
      store.findPublishedSession.mockResolvedValue(session({ userId: 8, projectId: 3 }));
      projects.findOneById.mockResolvedValueOnce({ id: 3 });
      await expect(records.getSessionDetails(5, 1, viewer)).resolves.toMatchObject({ id: 1, userId: 8 });

      projects.findOneById.mockRejectedValueOnce(new NotFoundException());
      const redacted = session({ id: 99 });
      await expect(records.getSessionDetails(5, 1, viewer, false, () => redacted)).resolves.toBe(redacted);
    });

    it('does not hide a failing project lookup behind a 404', async () => {
      store.findPublishedSession.mockResolvedValue(session({ userId: 8, projectId: 3 }));
      projects.findOneById.mockRejectedValueOnce(new Error('database down'));

      await expect(records.getSessionDetails(5, 1, viewer)).rejects.toThrow('database down');
    });
  });

  describe('history', () => {
    it('pages the sessions of a resource and optionally of one user', async () => {
      store.findHistory.mockResolvedValue({ data: [session()], total: 12 });

      await expect(records.getResourceUsageHistory(5, 2, 5, 7)).resolves.toEqual({ data: [session()], total: 12 });

      expect(store.findHistory).toHaveBeenCalledWith(5, 2, 5, 7);
    });
  });

  describe('assigning a project to an ended session', () => {
    const owner = { id: 7 };
    const ended = (overrides: Partial<UsageSession> = {}) =>
      session({ endTime: new Date('2026-08-28T11:00:00.000Z'), ...overrides });

    it('moves the session to the project the user may use', async () => {
      store.findSessionForProjectChange.mockResolvedValue(ended());
      projects.findOneById.mockResolvedValue({ id: 3 });

      await records.updateSessionProject(5, 1, owner, { projectId: 3 });

      expect(projects.findOneById).toHaveBeenCalledWith(7, 3);
      expect(store.assignProject).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { id: 3 });
    });

    it('takes a session out of its project', async () => {
      store.findSessionForProjectChange.mockResolvedValue(ended({ projectId: 3 }));

      await records.updateSessionProject(5, 1, owner, { projectId: null });

      expect(store.assignProject).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), null);
    });

    it.each([
      ['a session that does not exist', null, NotFoundException],
      ['a session that still runs', session(), BadRequestException],
      ['a door action', ended({ usageAction: ResourceUsageAction.DoorLock }), BadRequestException],
      ['the session of somebody else', ended({ userId: 8 }), ForbiddenException],
    ])('refuses %s', async (_name, found, error) => {
      store.findSessionForProjectChange.mockResolvedValue(found);

      await expect(records.updateSessionProject(5, 1, owner, { projectId: 3 })).rejects.toThrow(error);
      expect(store.assignProject).not.toHaveBeenCalled();
    });

    it('refuses a request without a project decision', async () => {
      store.findSessionForProjectChange.mockResolvedValue(ended());

      await expect(records.updateSessionProject(5, 1, owner, {})).rejects.toThrow(BadRequestException);
    });
  });
});
