import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListApiTokensQueryDto } from './api-token.dto';

describe('ListApiTokensQueryDto', () => {
  it.each([
    { page: '1.5', limit: '10' },
    { page: '1', limit: '10.5' },
  ])('rejects fractional pagination parameters: %o', async (query) => {
    const errors = await validate(plainToInstance(ListApiTokensQueryDto, query));

    expect(errors).not.toHaveLength(0);
  });
});
