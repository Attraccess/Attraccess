import { Resource, ResourceUsage, ResourceType, User } from '@attraccess/database-entities';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionReturnsTheNoActivityEndedSessionWithItsConfiguredEndNotesInUsageHistoryImmediately(
  scope: EndSessionTestScope,
): void {
  it('returns the no-activity-ended session with its configured end notes in usage history immediately', async () => {
    const configuredEndNotes = 'Ended automatically after 5 minutes of inactivity';
    const usage = {
      id: 42,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      endTime: null,
      endNotes: null,
      user: { id: 1, username: 'member' } as User,
      resource: { id: 1, type: ResourceType.Machine } as Resource,
    } as ResourceUsage;
    const updateQueryBuilder = scope.createMockQueryBuilder(null);

    scope.resourceUsageRepository.findOne.mockImplementation(async ({ where }) => {
      if (where?.id === usage.id || (where?.resourceId === usage.resourceId && usage.endTime === null)) {
        return usage;
      }
      return null;
    });
    scope.resourceUsageRepository.findAndCount = jest.fn().mockResolvedValue([[usage], 1]);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(updateQueryBuilder);
    scope.transactionalEntityManager.update.mockImplementation(async (entity, _id, values) => {
      if (entity === ResourceUsage) Object.assign(usage, values);
      return { affected: 1 };
    });

    // No-activity flows end a session with configured notes and skip interactive end forms.
    await scope.service.endSession(
      usage.resourceId,
      usage.user,
      { notes: configuredEndNotes },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
    const history = await scope.service.getResourceUsageHistory(usage.resourceId, 1, 10, usage.userId);

    expect(history.data).toEqual([expect.objectContaining({ id: usage.id, endNotes: configuredEndNotes })]);
  });
}
