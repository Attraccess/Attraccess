import { z } from 'zod';

export const MeteringTimeoutSecondsSchema = z.number().int().positive().max(600).default(30).meta({
  helpText: 'Maximum time to wait for the branch to acknowledge or report, in seconds.',
});

export const MeteringStartNodeDataSchema = z.object({ timeoutSeconds: MeteringTimeoutSecondsSchema });

export const MeteringCollectNodeDataSchema = z.object({
  timeoutSeconds: MeteringTimeoutSecondsSchema,
  interimIntervalMinutes: z.number().int().min(0).max(1440).default(1).meta({
    helpText:
      'How often to take an interim reading while a session runs (shown live in the resource, never billed). 0 disables.',
  }),
  finalAttempts: z.number().int().min(1).max(10).default(3).meta({
    helpText: 'Attempts to obtain a fresh final total when a session ends before energy billing is left pending.',
  }),
  finalRetryDelaySeconds: z.number().int().min(0).max(120).default(5).meta({
    helpText: 'Pause between final collection attempts, in seconds.',
  }),
});

export const MeteringReadyNodeDataSchema = z.object({
  baselineValue: z.string().optional().meta({
    helpText:
      'Only for lifetime counters that cannot be reset: the counter reading right now (template). Later totals are counted from it. Leave empty when the source was reset.',
  }),
  baselineUnit: z.string().optional().meta({ helpText: 'Energy unit of the baseline, e.g. kWh or Wh (template).' }),
  source: z.string().optional().meta({ helpText: 'Optional label identifying the physical meter (template).' }),
});

export const MeteringReportNodeDataSchema = z.object({
  value: z.string().min(1, 'Value is required').meta({
    helpText: 'Total energy consumed since the metering start, not power and not an increment (template).',
  }),
  unit: z.string().min(1, 'Unit is required').meta({
    helpText: 'Energy unit: Wh, kWh, MWh, mWh, J, kJ or MJ (template). Power units such as W or kW are rejected.',
  }),
  observedAt: z.string().optional().meta({
    helpText: 'When the source took the reading (ISO time, template). Defaults to the moment of reporting.',
  }),
  source: z.string().optional().meta({ helpText: 'Optional label identifying the physical meter (template).' }),
});
