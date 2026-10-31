import { z } from 'zod';
import { FEATURE_FAMILIES } from './constants';
import { uuidSchema } from './primitives';

export const ERROR_STATUS = {
  validation_failed: 400,
  forbidden_origin: 403,
  not_found: 404,
  method_not_allowed: 405,
  incompatible_release: 409,
  reconciliation_required: 409,
  payload_too_large: 413,
  unsupported_wire_version: 426,
  internal_error: 500,
  unsupported_capability: 501,
  sidecar_unavailable: 503,
  timeout: 504,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const errorCodeSchema = z.enum(ERROR_CODES);

export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1).max(1_000),
    correlationId: uuidSchema,
    retryable: z.boolean(),
    /** `uncertain` means the effect on the physical device is unknown. Never retry automatically. */
    outcome: z.enum(['uncertain']).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const unsupportedCapabilityDetailsSchema = z.strictObject({
  family: z.enum(FEATURE_FAMILIES),
});

const RETRYABLE: ReadonlySet<ErrorCode> = new Set(['sidecar_unavailable']);

export function buildError(
  code: ErrorCode,
  message: string,
  correlationId: string,
  extra: { details?: Record<string, unknown>; outcome?: 'uncertain'; retryable?: boolean } = {},
): ErrorEnvelope {
  const retryable = extra.outcome === 'uncertain' ? false : (extra.retryable ?? RETRYABLE.has(code));
  return {
    error: {
      code,
      message,
      correlationId,
      retryable,
      ...(extra.outcome ? { outcome: extra.outcome } : {}),
      ...(extra.details ? { details: extra.details } : {}),
    },
  };
}
