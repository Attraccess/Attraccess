import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindManyUsersQueryDto } from './findManyUsersQuery.dto';

describe('FindManyUsersQueryDto', () => {
  it.each(['emailVerified', 'ssoProviderNone'] as const)('rejects invalid %s boolean values', async (property) => {
    const query = plainToInstance(FindManyUsersQueryDto, { [property]: 'invalid' });

    const errors = await validate(query);

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property, constraints: expect.objectContaining({ isBoolean: expect.any(String) }) })]),
    );
  });

  it.each(['emailVerified', 'ssoProviderNone'] as const)('transforms valid %s boolean values', async (property) => {
    const query = plainToInstance(FindManyUsersQueryDto, { [property]: 'true' });

    expect(query[property]).toBe(true);
    expect(await validate(query)).toHaveLength(0);
  });
});
