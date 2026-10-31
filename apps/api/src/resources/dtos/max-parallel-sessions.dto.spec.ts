import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateResourceDto } from './updateResource.dto';
import { CreateResourceDto } from './createResource.dto';

async function errorsFor(dto: new () => object, maxParallelSessions: unknown) {
  const instance = plainToInstance(dto, { name: 'Laser', maxParallelSessions });
  const errors = await validate(instance, { skipMissingProperties: false });
  return errors.filter((e) => e.property === 'maxParallelSessions');
}

describe.each([
  ['UpdateResourceDto', UpdateResourceDto],
  ['CreateResourceDto', CreateResourceDto],
])('%s maxParallelSessions', (_name, dto) => {
  it.each(['1', '3', '1000'])('accepts %s', async (value) => {
    expect(await errorsFor(dto, value)).toHaveLength(0);
  });

  it('accepts an omitted value', async () => {
    expect(await errorsFor(dto, undefined)).toHaveLength(0);
  });

  it.each(['0', '-1', '1001', '2.5', 'abc', '', 'null', null])('rejects %p', async (value) => {
    expect(await errorsFor(dto, value)).toHaveLength(1);
  });
});
