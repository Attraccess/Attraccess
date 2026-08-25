import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindManyUsersQueryDto } from './findManyUsersQuery.dto';

describe('FindManyUsersQueryDto', () => {
  it.each(['emailVerified', 'ssoProviderNone', 'hasSsoProvider'] as const)(
    'rejects invalid %s boolean values',
    async (property) => {
      const query = plainToInstance(FindManyUsersQueryDto, { [property]: 'invalid' });

      const errors = await validate(query);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property,
            constraints: expect.objectContaining({ isBoolean: expect.any(String) }),
          }),
        ]),
      );
    },
  );

  it.each([
    ['emailVerified', 'true', true],
    ['emailVerified', 'false', false],
    ['ssoProviderNone', 'true', true],
    ['ssoProviderNone', 'false', false],
    ['hasSsoProvider', 'true', true],
    ['hasSsoProvider', 'false', false],
  ] as const)('transforms valid %s=%s boolean values with implicit conversion', async (property, value, expected) => {
    const query = plainToInstance(FindManyUsersQueryDto, { [property]: value }, { enableImplicitConversion: true });

    expect(query[property]).toBe(expected);
    expect(await validate(query)).toHaveLength(0);
  });

  it.each(['excludeRoleIds', 'excludeSsoProviderIds'] as const)(
    'transforms repeated %s values into positive integer arrays',
    async (property) => {
      const query = plainToInstance(FindManyUsersQueryDto, { [property]: ['2', '4'] });

      expect(query[property]).toEqual([2, 4]);
      expect(await validate(query)).toHaveLength(0);
    },
  );

  it.each(['excludeRoleIds', 'excludeSsoProviderIds'] as const)('rejects non-positive %s values', async (property) => {
    const query = plainToInstance(FindManyUsersQueryDto, { [property]: ['0'] });

    const errors = await validate(query);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property, constraints: expect.objectContaining({ min: expect.any(String) }) }),
      ]),
    );
  });
});
