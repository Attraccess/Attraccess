import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './createUser.dto';
import { InviteUserDto } from './inviteUser.dto';
import { AuthenticationType } from '@attraccess/application-models';

const IDENTITY = { username: 'ada', email: 'ada@example.com' };
const CREATE = { ...IDENTITY, password: 'secret', strategy: AuthenticationType.LOCAL_PASSWORD };

describe.each([
  ['CreateUserDto', CreateUserDto, CREATE],
  ['InviteUserDto', InviteUserDto, IDENTITY],
] as const)('%s names', (_name, Dto, base) => {
  const check = async (names: object) => {
    const dto = plainToInstance(Dto, { ...base, ...names }) as { firstName?: string | null; lastName?: string | null };
    return { dto, errors: (await validate(dto)).map((error) => error.property) };
  };

  it('accepts no names at all', async () => {
    expect((await check({})).errors).toEqual([]);
  });

  it('trims the names and stores a blank one as null', async () => {
    const { dto, errors } = await check({ firstName: '  Ada ', lastName: '   ' });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ firstName: 'Ada', lastName: null });
  });

  it('checks the length after trimming', async () => {
    expect((await check({ firstName: ` ${'x'.repeat(100)} ` })).errors).toEqual([]);
    expect((await check({ lastName: 'x'.repeat(101) })).errors).toEqual(['lastName']);
  });

  it('refuses control characters, NUL included', async () => {
    expect((await check({ firstName: 'a\u0000', lastName: 'b\u001b' })).errors).toEqual(['firstName', 'lastName']);
  });
});
