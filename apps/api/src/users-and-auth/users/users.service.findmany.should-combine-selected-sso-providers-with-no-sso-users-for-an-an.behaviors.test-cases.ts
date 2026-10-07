import { registerFindmanyScopeFixture } from './users.service.findmany-41e1ce.test-fixture';

export function registerShouldCombineSelectedSsoProvidersWithNoSsoUsersForAnAnPart6Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should combine selected SSO providers with no SSO users for an any match', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      subQuery: jest.fn(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const noSsoProvider = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT no SSO provider)'),
    };
    const ssoProviders = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT selected SSO providers)'),
    };
    query.subQuery.mockReturnValueOnce(noSsoProvider).mockReturnValueOnce(ssoProviders);
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, ssoProviderIds: [7], ssoProviderNone: true });

    expect(query.andWhere).toHaveBeenCalledWith(expect.anything());
    expect(query.setParameters).toHaveBeenCalledWith({
      ssoType: 'sso',
      ssoProviderIds: [7],
      ssoProviderCount: 1,
    });
  });
}

export function registerShouldDeduplicateSsoProvidersBeforeApplyingAnAllMatchPart7Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should deduplicate SSO providers before applying an all match', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      subQuery: jest.fn(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const ssoProviders = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT selected SSO providers)'),
    };
    query.subQuery
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getQuery: jest.fn().mockReturnValue('(SELECT no SSO provider)'),
      })
      .mockReturnValueOnce(ssoProviders);
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, ssoProviderIds: [7, 7], ssoProviderMatch: 'all' });

    expect(ssoProviders.having).toHaveBeenCalledWith('COUNT(DISTINCT ssoDetail.providerId) = :ssoProviderCount');
    expect(query.setParameters).toHaveBeenCalledWith({
      ssoType: 'sso',
      ssoProviderIds: [7],
      ssoProviderCount: 1,
    });
  });
}

export function registerShouldExcludeUsersAssignedAnySelectedRolePart5Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should exclude users assigned any selected role', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      subQuery: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const excludedRoles = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT excluded role user IDs)'),
    };
    query.subQuery.mockReturnValue(excludedRoles);
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, excludeRoleIds: [2, 2, 4] });

    expect(query.andWhere).toHaveBeenCalledWith('NOT EXISTS (SELECT excluded role user IDs)', {
      excludeRoleIds: [2, 4],
    });
  });
}

export function registerShouldExcludeUsersLinkedToAnySelectedSsoProviderPart8Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should exclude users linked to any selected SSO provider', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      subQuery: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const excludedSsoProviders = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT excluded SSO providers)'),
    };
    query.subQuery.mockReturnValue(excludedSsoProviders);
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, excludeSsoProviderIds: [7, 7] });

    expect(query.andWhere).toHaveBeenCalledWith('NOT EXISTS (SELECT excluded SSO providers)', {
      excludedSsoType: 'sso',
      excludeSsoProviderIds: [7],
    });
  });
}

export function registerShouldFilterByEmailVerificationStatusPart10Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should filter by email verification status', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, emailVerified: true });

    expect(query.andWhere).toHaveBeenCalledWith('user.isEmailVerified = :emailVerified', { emailVerified: true });
  });
}

export function registerShouldFilterUsersByRoleAssignmentPart2Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should filter users by role assignment', async () => {
    fixture.fixture.userRepository.findAndCount.mockResolvedValue([[], 0]);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, roleId: 42 });

    expect(fixture.fixture.userRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userRoles: { roleId: 42 } } }),
    );
  });
}

export function registerShouldOrderUsersByUsernameAscendingPart1Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should order users by username ascending', async () => {
    fixture.fixture.userRepository.findAndCount.mockResolvedValue([[], 0]);

    await fixture.fixture.service.findMany({ page: 1, limit: 10 });

    expect(fixture.fixture.userRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ order: { username: 'ASC' } }),
    );
  });
}

export function registerShouldRequireEverySelectedRoleWhenRolematchIsAllPart4Cases(
  fixture: ReturnType<typeof registerFindmanyScopeFixture>,
) {
  it('should require every selected role when roleMatch is all', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      subQuery: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const roleFilter = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('(SELECT role user IDs)'),
    };
    query.subQuery.mockReturnValue(roleFilter);
    fixture.fixture.userRepository.createQueryBuilder.mockReturnValue(query as never);

    await fixture.fixture.service.findMany({ page: 1, limit: 10, roleIds: [2, 2, 4], roleMatch: 'all' });

    expect(roleFilter.having).toHaveBeenCalledWith('COUNT(DISTINCT userRole.roleId) = :roleCount');
    expect(query.andWhere).toHaveBeenCalledWith('user.id IN (SELECT role user IDs)', {
      roleIds: [2, 4],
      roleCount: 2,
    });
  });
}
