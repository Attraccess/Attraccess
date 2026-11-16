import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateGlobalFlowDto, UpdateGlobalFlowDto } from './global-flow.dto';

// Same options as the global pipe in main.bootstrap.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const validate = (metatype: typeof CreateGlobalFlowDto | typeof UpdateGlobalFlowDto, body: object) =>
  pipe.transform(body, { type: 'body', metatype });

describe('global flow DTOs', () => {
  it.each([
    { name: null },
    { enabled: null },
    { name: '   ' },
    { name: 'x'.repeat(201) },
    { description: 'x'.repeat(2001) },
  ])('rejects the update %j with 400', async (body) => {
    await expect(validate(UpdateGlobalFlowDto, body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an empty update, a null description and a trimmed name', async () => {
    await expect(validate(UpdateGlobalFlowDto, {})).resolves.toEqual({});
    await expect(validate(UpdateGlobalFlowDto, { description: null })).resolves.toEqual({ description: null });
    await expect(validate(UpdateGlobalFlowDto, { name: '  Notify ', enabled: false })).resolves.toEqual({
      name: 'Notify',
      enabled: false,
    });
  });

  it.each([{}, { name: null }, { name: ' \t ' }, { name: 'x'.repeat(201) }])(
    'rejects the create %j with 400',
    async (body) => {
      await expect(validate(CreateGlobalFlowDto, body)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('creates with a trimmed name', async () => {
    await expect(validate(CreateGlobalFlowDto, { name: ' Notify ' })).resolves.toEqual({ name: 'Notify' });
  });
});
