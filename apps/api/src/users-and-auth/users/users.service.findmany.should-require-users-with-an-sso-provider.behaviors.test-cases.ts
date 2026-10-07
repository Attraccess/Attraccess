import { registerFindmanyScopeFixture } from './users.service.findmany-41e1ce.test-fixture';
import { registerShouldCombineSelectedSsoProvidersWithNoSsoUsersForAnAnPart6Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldDeduplicateSsoProvidersBeforeApplyingAnAllMatchPart7Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldExcludeUsersAssignedAnySelectedRolePart5Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldExcludeUsersLinkedToAnySelectedSsoProviderPart8Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldFilterByEmailVerificationStatusPart10Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldFilterUsersByRoleAssignmentPart2Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldOrderUsersByUsernameAscendingPart1Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldRequireEverySelectedRoleWhenRolematchIsAllPart4Cases } from './users.service.findmany.should-combine-selected-sso-providers-with-no-sso-users-for-an-an.behaviors.test-cases';
import { registerShouldRequireUsersWithAnSsoProviderPart9Cases } from './users.service.findmany.should-require-users-with-an-sso-provider.behaviors.test-cases';
import { registerShouldRetainTheRoleAssignmentFilterWhenSearchingPart3Cases } from './users.service.findmany.should-require-users-with-an-sso-provider.behaviors.test-cases';
import { registerShouldReturnPaginatedUsersCases } from './users.service.findmany.should-return-paginated-users.test-cases';
import { registerShouldThrowErrorForInvalidPaginationOptionsPart11Cases } from './users.service.findmany.should-require-users-with-an-sso-provider.behaviors.test-cases';
import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';

export function registerShouldRequireUsersWithAnSsoProviderPart9Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should require users with an SSO provider', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      subQuery: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const ssoProviderExists = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT any SSO provider)'),
    };
    query.subQuery.mockReturnValue(ssoProviderExists);
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, hasSsoProvider: true });

    expect(query.andWhere).toHaveBeenCalledWith('EXISTS (SELECT any SSO provider)', {
      anySsoType: 'sso',
    });
  });
}

export function registerShouldRetainTheRoleAssignmentFilterWhenSearchingPart3Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should retain the role assignment filter when searching', async () => {
    fixture.fixture.userRepository.findAndCount.mockResolvedValue([[], 0]);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, roleId: 42, search: 'alice' });

    expect(fixture.fixture.userRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([expect.objectContaining({ userRoles: { roleId: 42 } })]),
      }),
    );
  });
}

export function registerShouldThrowErrorForInvalidPaginationOptionsPart11Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should throw error for invalid pagination options', async () => {
    await expect(fixture.fixture.service.findMany({ page: 0, limit: 10 })).rejects.toThrow();
    await expect(fixture.fixture.service.findMany({ page: 1, limit: 0 })).rejects.toThrow();
  });
}

export function registerFindManyCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('findMany', () => {
    const scope = registerFindmanyScopeFixture(fixture);
    registerShouldReturnPaginatedUsersCases(scope);
    registerShouldOrderUsersByUsernameAscendingPart1Cases(scope);
    registerShouldFilterUsersByRoleAssignmentPart2Cases(scope);
    registerShouldRetainTheRoleAssignmentFilterWhenSearchingPart3Cases(scope);
    registerShouldRequireEverySelectedRoleWhenRolematchIsAllPart4Cases(scope);
    registerShouldExcludeUsersAssignedAnySelectedRolePart5Cases(scope);
    registerShouldCombineSelectedSsoProvidersWithNoSsoUsersForAnAnPart6Cases(scope);
    registerShouldDeduplicateSsoProvidersBeforeApplyingAnAllMatchPart7Cases(scope);
    registerShouldExcludeUsersLinkedToAnySelectedSsoProviderPart8Cases(scope);
    registerShouldRequireUsersWithAnSsoProviderPart9Cases(scope);
    registerShouldFilterByEmailVerificationStatusPart10Cases(scope);
    registerShouldThrowErrorForInvalidPaginationOptionsPart11Cases(scope);
  });
}
