import { z } from 'zod';
import { LogLevel } from '@nestjs/common';

// Keep the existing accepted names and Nest's filtering semantics.
export const logLevelsSchema = z
  .string()
  .default('log,error,warn')
  .transform(
    (value) =>
      value
        .split(',')
        .map((level) => level.trim().toLowerCase())
        .filter(Boolean) as LogLevel[],
  )
  .refine((levels) => levels.every((level) => ['log', 'error', 'warn', 'debug', 'verbose'].includes(level)), {
    message: 'Invalid log level(s). Allowed: log, error, warn, debug, verbose.',
  });

export const logDestinationsSchema = z
  .string()
  .default('console')
  .transform((value) => [
    ...new Set(
      value
        .split(',')
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  ])
  .refine((names) => names.length > 0, { message: 'LOG_DESTINATIONS must select at least one driver (e.g. console).' });
