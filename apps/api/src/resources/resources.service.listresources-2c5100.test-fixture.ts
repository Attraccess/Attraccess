import { Resource } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { registerResourcesServiceFixture } from './resources.service.resources-service.test-fixture';

export function registerListresourcesScopeFixture(fixture: ReturnType<typeof registerResourcesServiceFixture>) {
  let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<Resource>>;

  beforeEach(() => {
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getSql: jest.fn().mockReturnValue('SELECT * FROM resource'),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Resource>>;

    fixture.resourceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });
  return {
    get fixture() {
      return fixture;
    },
    get mockQueryBuilder() {
      return mockQueryBuilder;
    },
  };
}
