import { validate } from 'class-validator';
import { AuthenticationType } from '@attraccess/database-entities';
import { CreateUserDto } from './createUser.dto';

describe('CreateUserDto', () => {
  it('rejects self-registration as a guest', async () => {
    const dto = Object.assign(new CreateUserDto(), {
      username: 'guest-user',
      email: 'guest@example.com',
      password: 'correct-horse-battery-staple',
      strategy: AuthenticationType.LOCAL_PASSWORD,
      userType: 'guest',
    });

    const errors = await validate(dto);

    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'userType' })]));
  });
});
