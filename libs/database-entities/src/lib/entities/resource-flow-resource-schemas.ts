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

export const ErrorNodeDataSchema = z.object({
  message: z.string().min(1),
});

export const HealthStateOptionEnum = z.enum(['healthy', 'unhealthy']);

export const ResourceHealthHeartbeatNodeDataSchema = z.object({
  identifier: z.string().optional().default('').meta({
    helpText:
      'Optional label identifying which subsystem reports this heartbeat (e.g. "ir-bridge"). Leave empty for the resource default.',
  }),
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .describe('If no heartbeat is received within this many seconds, the resource is marked unhealthy'),
  unhealthyReason: z.string().optional().default('').meta({
    helpText: 'Reason recorded when the heartbeat times out (e.g. "no heartbeat received")',
  }),
});

export const ResourceHealthSetNodeDataSchema = z.object({
  identifier: z.string().optional().default('').meta({
    overrideWithInput: 'health.identifier',
    helpText:
      'Optional label identifying which subsystem this state refers to (e.g. "ir-bridge"). Overridable via payload path "health.identifier".',
  }),
  status: HealthStateOptionEnum.meta({
    overrideWithInput: 'health.status',
    helpText:
      'Static status for this node. Overridable via payload path "health.status" (must be "healthy" or "unhealthy").',
  }),
  reason: z.string().optional().default('').meta({
    overrideWithInput: 'health.reason',
    helpText:
      'Optional reason shown to users when unhealthy. Templates allowed. Overridable via payload path "health.reason".',
    stringVariant: 'multiline',
  }),
});
