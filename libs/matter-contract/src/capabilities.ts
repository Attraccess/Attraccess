import { z } from 'zod';
import { FEATURE_FAMILIES } from './constants';

export const featureFamilySchema = z.enum(FEATURE_FAMILIES);

export const capabilitySchema = z.strictObject({
  family: featureFamilySchema,
  /** The family is part of the contract. */
  defined: z.literal(true),
  /** The sidecar can actually serve the family right now. */
  available: z.boolean(),
  /** Why the family is unavailable. Present only when `available` is false. */
  reason: z.string().max(200).optional(),
});

export const capabilityReportSchema = z.strictObject({
  capabilities: z.array(capabilitySchema).length(FEATURE_FAMILIES.length),
});
export type CapabilityReport = z.infer<typeof capabilityReportSchema>;
