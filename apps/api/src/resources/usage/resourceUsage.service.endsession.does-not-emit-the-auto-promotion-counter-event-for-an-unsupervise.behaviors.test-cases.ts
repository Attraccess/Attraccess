import { ResourceUsage, User, Resource } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import {
  ResourceSupervisedUsageEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
} from './events/resource-usage.events';
import { registerEndsessionScopeFixture } from './resourceUsage.service.endsession-9b9974.test-fixture';

export function registerDoesNotEmitTheAutoPromotionCounterEventForAnUnsupervisePart16Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('does not emit the auto-promotion counter event for an unsupervised session end', async () => {
    const dto: EndUsageSessionDto = {};
    const sessionOwner = { id: 60, username: 'student' } as User;
    const mockActiveSession = {
      id: 9,
      resourceId: 40,
      userId: sessionOwner.id,
      supervisorUserId: null,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date() };

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      fixture.fixture.createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await fixture.fixture.service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

    const endedEmit = fixture.fixture.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeUndefined();
  });
}

export function registerDoesNotEmitTheNoteEventWhenSkipnotenotificationIsSetFloPart8Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('does not emit the note event when skipNoteNotification is set (flow-ended session)', async () => {
    fixture.setupEndSession();

    await fixture.fixture.service.endSession(
      1,
      fixture.mockUser,
      { notes: 'auto note' },
      { skipNoteNotification: true },
    );

    const noteEmit = fixture.fixture.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME,
    );
    expect(noteEmit).toBeUndefined();
  });
}

export function registerEmitsAResourceSessionEndedNotificationEventAfterEndingSoPart5Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it("emits a resource session ended notification event after ending someone else's session", async () => {
    const dto: EndUsageSessionDto = { notes: 'Manager stop' };
    const sessionOwner = { id: 77, username: 'member' } as User;
    const managerUser = {
      id: 88,
      username: 'manager',
    } as User;
    fixture.fixture.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
      resource: { id: 12, name: 'Laser cutter' } as Resource,
    } as ResourceUsage;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: `[By #${managerUser.id} - ${managerUser.username}] ${dto.notes}`,
    };

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await fixture.fixture.service.endSession(mockActiveSession.resourceId, managerUser, dto);

    const endedEmit = fixture.fixture.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeDefined();
    const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
    expect(payload).toBeInstanceOf(ResourceUsageSessionEndedEvent);
    expect(payload.usage).toBe(mockUpdatedSession);
    expect(payload.endedBy).toEqual({ id: managerUser.id, username: managerUser.username });
  });
}

export function registerEmitsASystemResourceSessionEndedNotificationEventForFlowPart6Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('emits a system resource session ended notification event for flow-ended sessions', async () => {
    const owner = { id: 77, username: 'member' } as User;
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: owner.id,
      startTime: new Date(),
      user: owner,
      resource: { id: 12, name: 'Laser cutter' } as Resource,
    } as ResourceUsage;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: 'Flow stop',
    };

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await fixture.fixture.service.endSession(
      mockActiveSession.resourceId,
      owner,
      { notes: 'Flow stop' },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );

    const endedEmit = fixture.fixture.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceUsageSessionEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeDefined();
    const payload = endedEmit?.[1] as ResourceUsageSessionEndedEvent;
    expect(payload.usage).toBe(mockUpdatedSession);
    expect(payload.endedBy).toBeNull();
  });
}

export function registerEmitsResourceusagenoteaddedeventWhenAUserNoteIsPresentPart7Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('emits ResourceUsageNoteAddedEvent when a user note is present', async () => {
    fixture.setupEndSession();

    await fixture.fixture.service.endSession(1, fixture.mockUser, { notes: 'note text' });

    const noteEmit = fixture.fixture.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceUsageNoteAddedEvent.EVENT_NAME,
    );
    expect(noteEmit).toBeDefined();
    const payload = noteEmit?.[1] as ResourceUsageNoteAddedEvent;
    expect(payload).toMatchObject({ resourceId: 1, note: 'note text', phase: 'end' });
  });
}

export function registerEmitsTheAutoPromotionCounterEventWhenASupervisedSessionPart15Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('emits the auto-promotion counter event when a supervised session ends', async () => {
    const dto: EndUsageSessionDto = {};
    const sessionOwner = { id: 60, username: 'student' } as User;
    const supervisorUser = { id: 61, username: 'supervisor' } as User;
    const mockActiveSession = {
      id: 9,
      resourceId: 40,
      userId: sessionOwner.id,
      supervisorUserId: supervisorUser.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date() };

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      fixture.fixture.createMockQueryBuilder(null) as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    await fixture.fixture.service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

    const endedEmit = fixture.fixture.eventEmitter.emit.mock.calls.find(
      (c) => c[0] === ResourceSupervisedUsageEndedEvent.EVENT_NAME,
    );
    expect(endedEmit).toBeDefined();
    const payload = endedEmit?.[1] as ResourceSupervisedUsageEndedEvent;
    expect(payload).toBeInstanceOf(ResourceSupervisedUsageEndedEvent);
    expect(payload).toMatchObject({ resourceId: 40, userId: 60, supervisorUserId: 61, usageId: 9 });
  });
}
