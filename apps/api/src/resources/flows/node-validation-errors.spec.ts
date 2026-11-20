import { z } from 'zod';
import { REQUIRED_FIELD_MESSAGE, zodErrorToFieldErrors } from './node-validation-errors';

function issuesOf(schema: z.ZodType, data: unknown) {
  const result = schema.safeParse(data);
  if (result.success) throw new Error('expected the data to be invalid');
  return zodErrorToFieldErrors(result.error, data);
}

describe('zodErrorToFieldErrors', () => {
  const schema = z.object({
    name: z.string().min(2),
    nested: z.object({ count: z.number() }).optional(),
  });

  it('names nested fields with a dotted path and tells missing from wrong values', () => {
    expect(issuesOf(schema, { nested: {} })).toEqual([
      { field: 'name', code: 'required', message: REQUIRED_FIELD_MESSAGE },
      { field: 'nested.count', code: 'required', message: REQUIRED_FIELD_MESSAGE },
    ]);
    expect(issuesOf(schema, { name: 7 })).toEqual([
      { field: 'name', code: 'invalid', message: expect.not.stringMatching(/^[[{]/) },
    ]);
  });

  it('reports a wrong value that is present as invalid, keeping the short Zod message', () => {
    const [error] = issuesOf(schema, { name: 'x' });
    expect(error).toMatchObject({ field: 'name', code: 'invalid' });
    expect(error.message).toContain('Too small');
  });

  it('reports a missing enum value as required, whatever code Zod uses for it', () => {
    // Zod 4 reports a missing enum as `invalid_value`, not `invalid_type`.
    const withEnum = z.object({ method: z.enum(['GET', 'POST']) });
    expect(issuesOf(withEnum, {})).toEqual([{ field: 'method', code: 'required', message: REQUIRED_FIELD_MESSAGE }]);
    expect(issuesOf(withEnum, { method: 'FETCH' })).toEqual([
      { field: 'method', code: 'invalid', message: expect.stringContaining('Invalid option') },
    ]);
  });

  it('uses "data" for an issue on the whole configuration', () => {
    expect(issuesOf(schema, undefined)).toEqual([{ field: 'data', code: 'required', message: REQUIRED_FIELD_MESSAGE }]);
    expect(issuesOf(schema, 'text')).toEqual([{ field: 'data', code: 'invalid', message: expect.any(String) }]);
  });
});
