import { ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';

export function registerEndsessionScopeFixture(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  const mockUser: User = { id: 1 } as User;

  const setupEndSession = () => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1, username: 'owner' } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'note text' };
    fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);
    const mockUpdateQueryBuilder = fixture.createMockQueryBuilder(null);
    (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
    fixture.resourceUsageRepository.createQueryBuilder.mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
  };
  return {
    get fixture() {
      return fixture;
    },
    get mockUser() {
      return mockUser;
    },
    get setupEndSession() {
      return setupEndSession;
    },
  };
}
