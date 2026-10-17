import { z } from 'zod';

const MeteringTimeoutSecondsSchema = z.number().int().positive().max(600).default(30).meta({
  helpText: 'Maximum time to wait for the branch to acknowledge or report, in seconds.',
});

const MeterIdSchema = z.number().int().positive().meta({ helpText: 'Choose a predefined meter on this resource.' });

export const MeteringStartNodeDataSchema = z.object({
  meterId: MeterIdSchema,
  timeoutSeconds: MeteringTimeoutSecondsSchema,
});

export const MeteringCollectNodeDataSchema = z.object({
  meterId: MeterIdSchema,
  timeoutSeconds: MeteringTimeoutSecondsSchema,
  interimIntervalMinutes: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .default(1)
    .meta({ helpText: 'Read the meter at this interval, including outside sessions. 0 disables periodic collection.' }),
  finalAttempts: z.number().int().min(1).max(10).default(3),
  finalRetryDelaySeconds: z.number().int().min(0).max(120).default(5),
});

export const MeteringReadyNodeDataSchema = z.object({
  meterId: MeterIdSchema,
  baselineValue: z.string().optional().meta({
    helpText: 'Current cumulative counter value (template). Leave empty if the start branch resets the counter.',
  }),
  source: z.string().optional(),
});

export const MeteringReportNodeDataSchema = z.object({
  meterId: MeterIdSchema,
  mode: z.enum(['total', 'increment']).default('total').meta({
    helpText:
      'A cumulative reading counts the increase since the previous reading. An increment adds the given amount.',
  }),
  value: z
    .string()
    .min(1, 'Value is required')
    .meta({ helpText: 'Non-negative measured value (template). No unit or conversion is applied.' }),
  observedAt: z.string().optional(),
  source: z.string().optional(),
});
