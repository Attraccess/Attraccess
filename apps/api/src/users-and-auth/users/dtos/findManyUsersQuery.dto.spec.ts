import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindManyUsersQueryDto } from './findManyUsersQuery.dto';

describe('FindManyUsersQueryDto', () => {
  it.each(['emailVerified', 'ssoProviderNone'] as const)('rejects invalid %s boolean values', async (property) => {
    const query = plainToInstance(FindManyUsersQueryDto, { [property]: 'invalid' });

    const errors = await validate(query);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property, constraints: expect.objectContaining({ isBoolean: expect.any(String) }) }),
      ]),
    );
  });

  it.each([
    ['emailVerified', 'true', true],
    ['emailVerified', 'false', false],
    ['ssoProviderNone', 'true', true],
    ['ssoProviderNone', 'false', false],
  ] as const)('transforms valid %s=%s boolean values with implicit conversion', async (property, value, expected) => {
    const query = plainToInstance(FindManyUsersQueryDto, { [property]: value }, { enableImplicitConversion: true });

    expect(query[property]).toBe(expected);
    expect(await validate(query)).toHaveLength(0);
  });
});
