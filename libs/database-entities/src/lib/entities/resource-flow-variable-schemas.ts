import { z } from 'zod';

export const VariableScopeSchema = z.enum(['resource', 'global']);

export const VariableKeySchema = z.string().min(1, 'Key is required');

export const SetVariablesNodeDataSchema = z.object({
  variables: z
    .array(
      z.object({
        key: VariableKeySchema,
        value: z.string().optional().default('').meta({ stringVariant: 'multiline' }),
        scope: VariableScopeSchema,
      }),
    )
    .min(1, 'At least one variable is required'),
});

export const GetVariablesNodeDataSchema = z.object({
  variables: z
    .array(
      z.object({
        key: VariableKeySchema,
        scope: VariableScopeSchema,
        payloadPath: z.string().min(1, 'Payload path is required'),
      }),
    )
    .min(1, 'At least one variable is required'),
});

export const VariableChangedNodeDataSchema = z.object({
  watches: z
    .array(z.object({ key: VariableKeySchema, scope: VariableScopeSchema }))
    .min(1, 'At least one watch is required'),
  source: z.enum(['any', 'exclude-self']).default('any'),
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
