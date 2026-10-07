import { User } from '@attraccess/database-entities';
import { registerFindmanyScopeFixture } from './users.service.findmany-41e1ce.test-fixture';
export function registerShouldReturnPaginatedUsersCases(fixture: ReturnType<typeof registerFindmanyScopeFixture>) {
  it('should return paginated users', async () => {
    const mockUsers = [
      {
        id: 1,
        username: 'user1',
        email: 'user1@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        lastUsernameChangeAt: null,
        deleteAccountToken: null,
        deleteAccountTokenExpiresAt: null,
        deleteAccountRequestedAt: null,
        deletedAt: null,
        resourceIntroductions: [],
        resourceUsages: [],
        resourceIntroducers: [],
        groupMemberships: [],
        nfcCards: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
        externalIdentifier: null,
        nfcKeySeedToken: null,
        ownedProjects: [],
        sessions: [],
        billingTransactions: [],
        initiatedBillingTransactions: [],
        creditBalance: 0,
        billingFactor: 100,
        projectMemberships: [],
        sentProjectInvitations: [],
        receivedProjectInvitations: [],
        formSubmissions: [],
        lockedUntil: null,
        failedLoginAttempts: 0,
        firstFailedLoginAt: null,
        locale: 'en',
      } as User,
      {
        id: 2,
        username: 'user2',
        email: 'user2@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        lastUsernameChangeAt: null,
        deleteAccountToken: null,
        deleteAccountTokenExpiresAt: null,
        deleteAccountRequestedAt: null,
        deletedAt: null,
        resourceIntroductions: [],
        resourceUsages: [],
        resourceIntroducers: [],
        groupMemberships: [],
        nfcCards: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
        externalIdentifier: null,
        nfcKeySeedToken: null,
        ownedProjects: [],
        sessions: [],
        billingTransactions: [],
        initiatedBillingTransactions: [],
        creditBalance: 0,
        billingFactor: 100,
        projectMemberships: [],
        sentProjectInvitations: [],
        receivedProjectInvitations: [],
        formSubmissions: [],
        lockedUntil: null,
        failedLoginAttempts: 0,
        firstFailedLoginAt: null,
        locale: 'en',
      } as User,
    ];

    fixture.fixture.userRepository.findAndCount.mockResolvedValue([mockUsers, 2]);

    const result = await fixture.fixture.service.findMany({ page: 1, limit: 10 });

    expect(result.data).toEqual(mockUsers);
    expect(result.total).toEqual(2);
    expect(result.page).toEqual(1);
    expect(result.limit).toEqual(10);
    expect(fixture.fixture.userRepository.findAndCount).toHaveBeenCalled();
  });
}
