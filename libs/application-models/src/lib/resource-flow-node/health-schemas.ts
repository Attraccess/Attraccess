import { z } from 'zod';

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
