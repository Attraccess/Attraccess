import { z } from 'zod';
import { ExternalEffectPolicySchema } from './external-effect-policy';

export const BillingTransactionItemCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  unitPrice: z.number().int().meta({
    isCurrency: true,
  }),
  quantity: z.coerce.number().int().positive().meta({
    overrideWithInput: 'quantity',
  }),
  description: z.string().optional().meta({
    stringVariant: 'multiline',
  }),
  externalReference: z.string().optional().meta({
    overrideWithInput: 'externalReference',
  }),
});

export const ResourceActivityTrackActivityNodeDataSchema = z.object({});

export const ResourceOperatingTransitionNodeDataSchema = z.object({});

export const InputResourceActivityNoActivityNodeDataSchema = z.object({
  minInactivityMinutes: z
    .number()
    .int()
    .positive()
    .describe('Duration in minutes that the resource needs to be inactive before this node is triggered'),
});

export const ResourceUsageEndSessionNodeDataSchema = z
  .object({
    notes: z.string().optional().meta({
      stringVariant: 'multiline',
    }),
  })
  .extend(ExternalEffectPolicySchema.shape)
  .optional();
