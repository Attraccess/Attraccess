import { z } from 'zod';

export const NodeWithoutDataSchema = z.object({}).optional();

export const ButtonNodeDataSchema = z.object({
  label: z.string().min(1, 'Label is required'),
});

export const WaitNodeDataSchema = z.object({
  duration: z.number().int().positive('Duration must be a positive integer'),
  unit: z.enum(['seconds', 'minutes', 'hours']),
});

export const IfNodeDataSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  comparisonOperator: z.enum(['=', '!=', '>', '<', '>=', '<=']),
  comparisonValueIsPath: z.boolean().default(false),
  comparisonValue: z.string().min(1, 'Comparison value is required'),
});

export const SetPayloadNodeDataSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().min(1, 'Key is required'),
        value: z.string().optional().default('').meta({
          stringVariant: 'multiline',
        }),
      }),
    )
    .default([]),
});

export const ErrorNodeDataSchema = z.object({
  message: z.string().min(1),
});
