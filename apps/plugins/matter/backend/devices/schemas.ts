import { z } from 'zod';
import { LIFECYCLE_STATES } from './constants';

const uuid = z.uuid();

/** Empty text clears a field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

export const metadataSchema = z
  .strictObject({
    displayName: optionalText(100).optional(),
    description: optionalText(500).optional(),
    location: optionalText(100).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one of displayName, description or location is required.',
  });
export type MetadataInput = z.infer<typeof metadataSchema>;

export const claimSchema = z.strictObject({ displayName: z.string().trim().min(1).max(100).optional() });
export const relinkSchema = z.strictObject({
  sourceNodeId: uuid,
  confirmIdentityMismatch: z.boolean().optional(),
});
export const forceRemoveSchema = z.strictObject({ confirm: z.literal(true) });
export const idParamSchema = uuid;
export const listQuerySchema = z.strictObject({
  lifecycleState: z.enum(LIFECYCLE_STATES).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
