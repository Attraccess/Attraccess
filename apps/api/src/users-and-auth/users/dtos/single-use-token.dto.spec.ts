import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptInvitationDto } from './acceptInvitation.dto';
import { ChangePasswordDto } from './changePassword.dto';
import { DeleteAccountConfirmDto } from './deleteAccountConfirm.dto';
import { VerifyEmailDto } from './verifyEmail.dto';

// These public endpoints hash the token before looking it up, and hashing refuses an empty string.
// Validation must reject it first, so the client gets a 400 instead of a 500.
const cases = [
  { name: 'VerifyEmailDto', dto: VerifyEmailDto, rest: { email: 'ada@example.test' } },
  {
    name: 'AcceptInvitationDto',
    dto: AcceptInvitationDto,
    rest: { email: 'ada@example.test', password: 'Tr0ub4dor-Hummingbird-9!plate' },
  },
  { name: 'ChangePasswordDto', dto: ChangePasswordDto, rest: { password: 'Tr0ub4dor-Hummingbird-9!plate' } },
  { name: 'DeleteAccountConfirmDto', dto: DeleteAccountConfirmDto, rest: { email: 'ada@example.test' } },
] as const;

const tokenErrors = async (dto: (typeof cases)[number]['dto'], payload: object) =>
  (await validate(plainToInstance(dto, payload) as object)).filter((error) => error.property === 'token');

describe.each(cases)('$name token', ({ dto, rest }) => {
  it('accepts a non-empty token', async () => {
    expect(await tokenErrors(dto, { ...rest, token: 'abc123' })).toEqual([]);
  });

  it('refuses an empty token', async () => {
    expect(await tokenErrors(dto, { ...rest, token: '' })).toHaveLength(1);
  });

  it('refuses a missing token', async () => {
    expect(await tokenErrors(dto, rest)).toHaveLength(1);
  });
});
